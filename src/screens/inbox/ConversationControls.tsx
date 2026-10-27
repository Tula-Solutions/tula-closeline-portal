import { type FormEvent, useState } from 'react'
import { type Conversation, replyRequestSchema } from 'tula-closeline-contract'
import { fingerprint } from '~/api/idempotency'
import { presentConversationControl } from '~/api/inbox-messages'
import { useApp } from '~/app-context'
import { Section } from '~/components/app/section'
import { refresh, storeConversation } from '~/data/queries'
import { Banner } from '~/ui/Banner'
import { SubmitButton } from '~/ui/SubmitButton'
import { TextAreaField } from '~/ui/TextAreaField'
import { useFeedback } from '~/ui/useFeedback'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'

/**
 * Who answers a Conversation, and the way to change it: take it over from the Agent, reply as the
 * Rep while in control, hand it back. Core decides who may; a refusal is worded from its code.
 */
export function ConversationControls(props: { readonly conversation: Conversation }) {
  const { conversation } = props
  const feedback = useFeedback()
  const [error, setError] = useState<string | undefined>()
  const { bannerRef, focusFirstError } = useFocusOnError()
  const fail = (failure: unknown) => {
    feedback.failed()
    setError(presentConversationControl(failure).message)
    focusFirstError()
  }
  if (conversation.state === 'closed') {
    return (
      <Section id='control' title='Who answers'>
        <p className='m-0'>This Conversation is closed, so nobody can reply in it.</p>
      </Section>
    )
  }
  return (
    <Section id='control' title='Who answers'>
      <p role='status' className='notice'>
        {feedback.notice}
      </p>
      {error === undefined ? null : (
        <Banner kind='error' innerRef={bannerRef}>
          {error}
        </Banner>
      )}
      {conversation.controller === 'agent' ? (
        <TakeOver
          conversation={conversation}
          onDone={(notice) => {
            setError(undefined)
            feedback.done(notice)
          }}
          onFail={fail}
        />
      ) : (
        <>
          <HandBack
            conversation={conversation}
            onDone={(notice) => {
              setError(undefined)
              feedback.done(notice)
            }}
            onFail={fail}
          />
          <ReplyForm
            conversation={conversation}
            onDone={(notice) => {
              setError(undefined)
              feedback.done(notice)
            }}
            onFail={fail}
          />
        </>
      )}
    </Section>
  )
}

type Wiring = {
  readonly conversation: Conversation
  readonly onDone: (notice: string) => void
  readonly onFail: (failure: unknown) => void
}

function TakeOver(props: Wiring) {
  const { conversation } = props
  const app = useApp()
  const take = useSubmit<void>(
    async () => {
      const attempt = app.keys.begin(fingerprint.takeover(conversation.id))
      let taken: Conversation
      try {
        taken = await app.inbox.takeOver(conversation.id, attempt.key)
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      await storeConversation(app, taken)
      props.onDone('You took over. The Agent has stopped and its waiting Drafts are void.')
    },
    { onError: props.onFail }
  )
  return (
    <div className='flex flex-col gap-3'>
      <p className='m-0 max-w-[68ch]'>
        The Agent is answering. Take over to write the replies yourself: its waiting Drafts are
        voided and it stops until you hand the Conversation back.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          take.submit()
        }}
      >
        <SubmitButton pending={take.pending}>Take over</SubmitButton>
      </form>
    </div>
  )
}

function HandBack(props: Wiring) {
  const { conversation } = props
  const app = useApp()
  const back = useSubmit<void>(
    async () => {
      const attempt = app.keys.begin(fingerprint.handback(conversation.id))
      let handed: Conversation
      try {
        handed = await app.inbox.handBack(conversation.id, attempt.key)
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      await storeConversation(app, handed)
      props.onDone('Handed back. The Agent answers new replies again.')
    },
    { onError: props.onFail }
  )
  return (
    <div className='mb-8 flex flex-col gap-3'>
      <p className='m-0 max-w-[68ch]'>
        A Rep is answering and the Agent is stopped. Hand the Conversation back when the Agent
        should answer new replies again.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          back.submit()
        }}
      >
        <SubmitButton pending={back.pending} variant='outline'>
          Hand back to the Agent
        </SubmitButton>
      </form>
    </div>
  )
}

function ReplyForm(props: Wiring) {
  const { conversation } = props
  const app = useApp()
  const [text, setText] = useState('')
  const [fieldError, setFieldError] = useState<string | undefined>()
  const { formRef, focusFirstError } = useFocusOnError()
  const send = useSubmit<string>(
    async (body) => {
      const attempt = app.keys.begin(fingerprint.conversationReply(conversation.id, body))
      try {
        await app.inbox.reply(conversation.id, body, attempt.key)
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      setText('')
      await refresh(app, 'inbox')
      props.onDone('Reply sent to the channel. It shows below once the channel confirms it.')
    },
    { onError: props.onFail }
  )
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (send.pending) {
      return
    }
    setFieldError(undefined)
    const parsed = replyRequestSchema.safeParse({ body: text })
    if (!parsed.success) {
      setFieldError('Write a reply of up to 20,000 characters.')
      focusFirstError()
      return
    }
    send.submit(parsed.data.body)
  }
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-label='Reply as a Rep'>
      <TextAreaField
        label='Your reply'
        hint='Sent through the Conversation’s channel as you, not as the Agent.'
        value={text}
        rows={6}
        error={fieldError}
        onChange={(event) => setText(event.target.value)}
      />
      <SubmitButton pending={send.pending}>Send reply</SubmitButton>
    </form>
  )
}
