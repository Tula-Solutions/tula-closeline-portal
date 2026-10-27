import { type FormEvent, useState } from 'react'
import {
  CONSENT_CHANNELS,
  type ConsentChannel,
  type ConsentWording,
  type CreateConsentWordingRequest,
  createConsentWordingRequestSchema,
  MAX_CONSENT_WORDING_LENGTH,
} from 'tula-closeline-contract'
import { presentConsent } from '~/api/consent-messages'
import { fingerprint } from '~/api/idempotency'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { Section } from '~/components/app/section'
import { CHANNEL_NAME } from '~/data/consent'
import { can } from '~/data/permissions'
import { refresh, useConsentWordings } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { Banner } from '~/ui/Banner'
import { Paged } from '~/ui/Paged'
import { TextAreaField } from '~/ui/TextAreaField'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useFeedback } from '~/ui/useFeedback'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'
import { When } from '~/ui/When'

/** The Organization's Consent Wording: every role reads it, Owners and Admins write it. */
export function ConsentWordingScreen() {
  useDocumentTitle('Consent Wording')
  const role = useRole()
  const feedback = useFeedback()
  const wordings = useConsentWordings(role !== null)
  if (role === null) {
    return null
  }
  const manage = can.manageConsentWording(role)
  const replaced = new Set(wordings.items.map((wording) => wording.supersedesId))
  const current = wordings.items.filter((wording) => !replaced.has(wording.id))
  return (
    <>
      <PageHeader
        eyebrow='Organization'
        title='Consent Wording'
        description='The exact text a Prospect is shown when agreeing to be contacted. Closeline ships none: the text is yours, reviewed by your own counsel.'
      />
      <div className='grid items-start gap-12 lg:grid-cols-12'>
        {manage ? (
          <div className='flex flex-col gap-12 lg:sticky lg:top-8 lg:order-2 lg:col-span-4'>
            <Section
              id='new-wording'
              title='Write a Consent Wording'
              description='Version 1 of a new text, for the channels it covers.'
            >
              <WordingForm mode='create' onDone={feedback.done} onFail={feedback.failed} />
            </Section>
          </div>
        ) : null}
        <div
          className={`flex min-w-0 flex-col gap-8 lg:order-1 ${manage ? 'lg:col-span-8' : 'lg:col-span-12'}`}
        >
          <p role='status' className='notice'>
            {feedback.notice}
          </p>
          {manage ? null : (
            <p className='hint m-0'>
              Only an Owner or Admin can write or change a Consent Wording. You can read what is in
              use.
            </p>
          )}
          <ChannelCoverage ready={wordings.state.hasData} current={current} />
          <h2 className='m-0 border-t border-rule-strong pt-4'>All wordings</h2>
          <Paged
            noun='Consent Wordings'
            emptyText='No Consent Wording yet.'
            emptyHint='Until one covers a channel, consent cannot be recorded for it and no Agent may contact a Prospect on it.'
            state={wordings.state}
            present={presentConsent}
          >
            <ul
              className='m-0 list-none divide-y border-y p-0 motion-safe:animate-fade'
              aria-label='Consent Wordings'
            >
              {wordings.items.map((wording) => (
                <WordingItem
                  key={wording.id}
                  wording={wording}
                  replaced={replaced.has(wording.id)}
                  manage={manage}
                  onDone={feedback.done}
                  onFail={feedback.failed}
                />
              ))}
            </ul>
          </Paged>
        </div>
      </div>
    </>
  )
}

/** One line per channel: the version in use, or that none covers it. */
function ChannelCoverage(props: {
  readonly ready: boolean
  readonly current: readonly ConsentWording[]
}) {
  if (!props.ready) {
    return null
  }
  return (
    <section aria-label='Wording in use by channel'>
      <h2 className='m-0 border-t border-rule-strong pt-4'>In use, by channel</h2>
      <ul className='m-0 mt-2 list-none divide-y border-y p-0'>
        {CONSENT_CHANNELS.map((channel) => {
          const covering = props.current.find((wording) => wording.channels.includes(channel))
          return (
            <li key={channel} className='flex flex-wrap items-baseline gap-x-4 py-2'>
              <span className='label-mono min-w-32'>{CHANNEL_NAME[channel]}</span>
              <span className='hint'>
                {covering ? `Version ${covering.version}` : 'No Consent Wording covers this yet'}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function WordingItem(props: {
  readonly wording: ConsentWording
  readonly replaced: boolean
  readonly manage: boolean
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const { wording } = props
  const [mode, setMode] = useState<'edit' | 'version' | null>(null)
  const done = (notice: string) => {
    setMode(null)
    props.onDone(notice)
  }
  const status = props.replaced
    ? 'Replaced by a newer version'
    : wording.locked
      ? 'In use as evidence, so it cannot change'
      : 'Not used yet, so it can still be edited'
  return (
    <li className='py-4'>
      <div className='list-item-head'>
        <div className='flex min-w-0 flex-col'>
          <span className='label-mono block'>
            Version {wording.version} · {wording.channels.map((c) => CHANNEL_NAME[c]).join(', ')}
          </span>
          <p className='mt-2 mb-0 whitespace-pre-wrap break-words'>
            <bdi>{wording.text}</bdi>
          </p>
          <span className='hint mt-2'>
            {status} · Written <When iso={wording.createdAt} />
          </span>
        </div>
        {props.manage && !props.replaced ? (
          <div className='row-actions'>
            {wording.locked ? null : (
              <button
                type='button'
                className='button button-quiet'
                aria-label={`Edit version ${wording.version}`}
                aria-expanded={mode === 'edit'}
                aria-controls={`${wording.id}-form`}
                onClick={() => setMode(mode === 'edit' ? null : 'edit')}
              >
                Edit
              </button>
            )}
            <button
              type='button'
              className='button button-quiet'
              aria-label={`Write a new version of version ${wording.version}`}
              aria-expanded={mode === 'version'}
              aria-controls={`${wording.id}-form`}
              onClick={() => setMode(mode === 'version' ? null : 'version')}
            >
              New version
            </button>
          </div>
        ) : null}
      </div>
      {mode === null ? null : (
        <div id={`${wording.id}-form`} className='mt-4 border-l-2 border-rule-strong pl-4'>
          <WordingForm
            mode={mode}
            wording={wording}
            onDone={done}
            onFail={props.onFail}
            onCancel={() => setMode(null)}
          />
        </div>
      )}
    </li>
  )
}

type FormErrors = { text?: string; channels?: string; form?: string }

function WordingForm(
  props: { readonly onDone: (notice: string) => void; readonly onFail: () => void } & (
    | { readonly mode: 'create'; readonly wording?: undefined; readonly onCancel?: undefined }
    | {
        readonly mode: 'edit' | 'version'
        readonly wording: ConsentWording
        readonly onCancel: () => void
      }
  )
) {
  const app = useApp()
  const [text, setText] = useState(props.wording?.text ?? '')
  const [channels, setChannels] = useState<readonly ConsentChannel[]>(props.wording?.channels ?? [])
  const [errors, setErrors] = useState<FormErrors>({})
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const save = useSubmit<CreateConsentWordingRequest>(
    async (body) => {
      if (props.mode === 'edit') {
        await app.consent.updateConsentWording(props.wording.id, body)
      } else {
        const attempt = app.keys.begin(
          fingerprint.consentWording(props.wording?.id ?? '', JSON.stringify(body))
        )
        try {
          if (props.mode === 'version') {
            await app.consent.createConsentWordingVersion(props.wording.id, body, attempt.key)
          } else {
            await app.consent.createConsentWording(body, attempt.key)
          }
        } catch (error) {
          attempt.failed(error)
          throw error
        }
        attempt.succeeded()
      }
      if (props.mode === 'create') {
        setText('')
        setChannels([])
      }
      setErrors({})
      await refresh(app, 'consent')
      props.onDone(
        props.mode === 'edit'
          ? 'Consent Wording saved.'
          : props.mode === 'version'
            ? 'New version written.'
            : 'Consent Wording written.'
      )
    },
    {
      onError(error) {
        props.onFail()
        setErrors({ form: presentConsent(error).message })
        focusFirstError()
      },
    }
  )
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (save.pending) {
      return
    }
    props.onFail()
    const parsed = createConsentWordingRequestSchema.safeParse({ text, channels })
    const next: FormErrors = {}
    if (channels.length === 0) {
      next.channels = 'Choose at least one channel the text covers.'
    }
    if (text.trim() === '') {
      next.text = 'Write the text a Prospect will be shown.'
    } else if (!parsed.success && parsed.error.issues.some((issue) => issue.path[0] === 'text')) {
      next.text = `Keep the text to ${MAX_CONSENT_WORDING_LENGTH} characters, without control characters.`
    }
    if (!parsed.success || next.text !== undefined || next.channels !== undefined) {
      setErrors(next)
      focusFirstError()
      return
    }
    setErrors({})
    save.submit(parsed.data)
  }
  const toggle = (channel: ConsentChannel, on: boolean) =>
    setChannels(CONSENT_CHANNELS.filter((c) => (c === channel ? on : channels.includes(c))))
  const verb =
    props.mode === 'edit'
      ? 'Save changes'
      : props.mode === 'version'
        ? 'Write version'
        : 'Write wording'
  const busy = props.mode === 'edit' ? 'Saving...' : 'Writing...'
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className='max-w-none gap-0'>
      {errors.form ? (
        <Banner kind='error' innerRef={bannerRef}>
          {errors.form}
        </Banner>
      ) : null}
      <TextAreaField
        label='Text shown to the Prospect'
        name='text'
        autoComplete='off'
        hint='Kept unchanged once any consent is recorded against it.'
        value={text}
        error={errors.text}
        onChange={(event) => setText(event.target.value)}
      />
      <fieldset className='field mb-4 border-0 p-0'>
        <legend className='mb-2 text-sm font-medium'>Channels it covers</legend>
        {CONSENT_CHANNELS.map((channel) => (
          <label key={channel} className='mb-1 flex items-center'>
            <input
              type='checkbox'
              name='channels'
              checked={channels.includes(channel)}
              aria-describedby={errors.channels ? 'wording-channels-error' : undefined}
              onChange={(event) => toggle(channel, event.target.checked)}
            />
            {CHANNEL_NAME[channel]}
          </label>
        ))}
        {errors.channels ? (
          <p className='field-error' id='wording-channels-error'>
            <strong>Error:</strong> {errors.channels}
          </p>
        ) : null}
      </fieldset>
      <div className='row-actions'>
        <button type='submit' className='button' aria-disabled={save.pending}>
          {save.pending ? busy : verb}
        </button>
        {props.onCancel ? (
          <button type='button' className='button button-quiet' onClick={props.onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  )
}
