import { getRouteApi, Link } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import {
  type ApproveDraftRequest,
  approveDraftRequestSchema,
  type Decision,
  type Draft,
  MAX_DECISION_NOTE_LENGTH,
  rejectDraftRequestSchema,
} from 'tula-closeline-contract'
import { fingerprint } from '~/api/idempotency'
import { presentInbox } from '~/api/inbox-messages'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { Section } from '~/components/app/section'
import { can } from '~/data/permissions'
import {
  refresh,
  useApprovalQueue,
  useDraft,
  useDraftDecisions,
  useDraftSources,
} from '~/data/queries'
import { useRole } from '~/data/session-role'
import { CHANNEL_WORD, DECISION_WORD, DRAFT_STATUS_WORD, HOLD_WORD } from '~/screens/inbox/words'
import { Banner } from '~/ui/Banner'
import { Paged } from '~/ui/Paged'
import { ScrollRegion } from '~/ui/ScrollRegion'
import { SubmitButton } from '~/ui/SubmitButton'
import { TextAreaField } from '~/ui/TextAreaField'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'
import { When } from '~/ui/When'

const route = getRouteApi('/_app/inbox/approvals/$draftId')

/** One Draft: what it says, why it was written, what it cites, and the form that decides it. */
export function DraftScreen() {
  useDocumentTitle('Draft')
  const { draftId } = route.useParams()
  const draft = useDraft(draftId)
  return (
    <>
      <PageHeader
        eyebrow='Approval queue'
        title='Draft reply'
        description='Read what the Agent wrote and what it relied on, then approve it, change it, or reject it.'
      />
      {draft.isPending ? (
        <p role='status' className='notice'>
          Loading the Draft...
        </p>
      ) : draft.isError ? (
        <>
          <Banner kind='error'>{presentInbox(draft.error).message}</Banner>
          <BackToQueue />
        </>
      ) : (
        <DraftPanel draft={draft.data} />
      )}
    </>
  )
}

function BackToQueue() {
  return (
    <p>
      <Link to='/inbox/approvals'>Back to the approval queue</Link>
    </p>
  )
}

function DraftPanel(props: { readonly draft: Draft }) {
  const { draft } = props
  const role = useRole()
  // The queue says whether this caller may decide the Draft (the Conversation's Rep, or an Admin or Owner).
  const queue = useApprovalQueue(
    { conversationId: draft.conversationId },
    draft.status === 'pending'
  )
  const entry = queue.items.find((item) => item.draft.id === draft.id)
  const [decided, setDecided] = useState<string | null>(null)
  return (
    <div className='flex flex-col gap-12'>
      <div className='grid items-start gap-12 lg:grid-cols-12'>
        <div className='flex min-w-0 flex-col gap-6 lg:col-span-7'>
          <dl className='m-0 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm'>
            <dt className='label-mono'>Status</dt>
            <dd className='m-0'>{DRAFT_STATUS_WORD[draft.status]}</dd>
            {entry === undefined ? null : (
              <>
                <dt className='label-mono'>Channel</dt>
                <dd className='m-0'>{CHANNEL_WORD[entry.channel]}</dd>
              </>
            )}
            {draft.hold === null ? null : (
              <>
                <dt className='label-mono'>Why it waits</dt>
                <dd className='m-0'>{HOLD_WORD[draft.hold]}</dd>
              </>
            )}
            {draft.confidence === null ? null : (
              <>
                <dt className='label-mono'>Confidence</dt>
                <dd className='m-0'>{Math.round(draft.confidence * 100)}%</dd>
              </>
            )}
            {draft.reason === null ? null : (
              <>
                <dt className='label-mono'>Why it was written</dt>
                <dd className='m-0'>
                  <Untrusted value={draft.reason.strategy} />
                </dd>
              </>
            )}
          </dl>
          {draft.ungrounded ? (
            <p className='m-0 border-l-2 border-rule-strong pl-4 font-medium'>
              This Draft cites no Playbook source.
            </p>
          ) : null}
          {decided !== null ? (
            <Banner kind='success'>
              <span>{decided}</span> <BackToQueue />
            </Banner>
          ) : draft.status !== 'pending' ? (
            <ReadOnlyBody draft={draft} />
          ) : queue.state.isPending ? (
            <p role='status' className='notice'>
              Checking who may decide this Draft...
            </p>
          ) : queue.state.isError ? (
            <>
              <ReadOnlyBody draft={draft} />
              <Banner kind='error' className='mb-2'>
                We could not check who may decide this Draft.{' '}
                {presentInbox(queue.state.error).message}
              </Banner>
              <button
                type='button'
                className='button button-quiet'
                onClick={() => void queue.state.refetch()}
              >
                Check again
              </button>
            </>
          ) : entry?.canApprove === true ? (
            <Decide draft={draft} onDecided={setDecided} />
          ) : (
            <>
              <ReadOnlyBody draft={draft} />
              <p role='status' className='notice'>
                Only the Rep who owns this Conversation, or an Admin or Owner, can decide this
                Draft.
              </p>
            </>
          )}
        </div>
        <div className='min-w-0 lg:col-span-5'>
          <SourcesSection draft={draft} />
        </div>
      </div>
      {role !== null && can.viewDecisions(role) ? <Decisions draftId={draft.id} /> : null}
    </div>
  )
}

function ReadOnlyBody(props: { readonly draft: Draft }) {
  return (
    <div>
      <h2 className='m-0 border-t border-rule-strong pt-4'>Reply</h2>
      <p className='whitespace-pre-wrap break-words'>{props.draft.body}</p>
    </div>
  )
}

function SourcesSection(props: { readonly draft: Draft }) {
  const { draft } = props
  const sources = useDraftSources(draft.id)
  if (draft.sources.length === 0) {
    return (
      <Section id='sources' title='Sources' description='What the Agent relied on.'>
        <p className='m-0'>Nothing from your Playbook was cited.</p>
      </Section>
    )
  }
  return (
    <Section
      id='sources'
      title='Sources'
      description='The passages of your Playbook the Agent relied on, in the order it cited them.'
    >
      {sources.isPending ? (
        <p role='status' className='notice'>
          Loading the passages...
        </p>
      ) : sources.isError ? (
        <>
          <Banner kind='error' className='mb-2'>
            The cited passages could not be loaded. {presentInbox(sources.error).message}
          </Banner>
          <button
            type='button'
            className='button button-quiet'
            onClick={() => void sources.refetch()}
          >
            Try again
          </button>
        </>
      ) : (
        <ol className='m-0 flex list-none flex-col gap-6 p-0' aria-label='Sources'>
          {draft.sources.map((source, index) => {
            const found = sources.data.items.find(
              (item) =>
                item.source.kind === source.kind && item.source.sourceRef === source.sourceRef
            )
            return (
              <li key={`${source.kind}:${source.sourceRef}`} className='border-t pt-3'>
                <span className='label-mono block'>
                  {index + 1} · {source.kind === 'moment' ? 'A moment from a Deal' : 'A document'}
                  {source.outcome === null ? '' : ` · ${source.outcome.replaceAll('_', ' ')}`}
                  {source.evidenceCount > 1 ? ` · ${source.evidenceCount} pieces of evidence` : ''}
                </span>
                {found === undefined ? (
                  <p className='m-0 text-muted-foreground'>The passage is not available.</p>
                ) : (
                  <p className='m-0 whitespace-pre-wrap break-words'>{found.passage}</p>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </Section>
  )
}

function Decide(props: { readonly draft: Draft; readonly onDecided: (notice: string) => void }) {
  const { draft } = props
  return (
    <div className='flex flex-col gap-10'>
      <ApproveForm draft={draft} onDecided={props.onDecided} />
      <RejectForm draft={draft} onDecided={props.onDecided} />
    </div>
  )
}

function ConversationLink(props: { readonly conversationId: string }) {
  return (
    <Link to='/inbox/$conversationId' params={{ conversationId: props.conversationId }}>
      Open the Conversation
    </Link>
  )
}

function ApproveForm(props: {
  readonly draft: Draft
  readonly onDecided: (notice: string) => void
}) {
  const { draft } = props
  const app = useApp()
  const [text, setText] = useState(draft.body)
  const [acknowledged, setAcknowledged] = useState(false)
  const [error, setError] = useState<{ message: string; link: boolean } | null>(null)
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const edited = text !== draft.body
  const approve = useSubmit<ApproveDraftRequest>(
    async (body) => {
      const kind = body.body === undefined ? 'approve' : 'edit-approve'
      const attempt = app.keys.begin(
        fingerprint.draftDecision(draft.id, kind, JSON.stringify(body))
      )
      try {
        await app.approvals.approveDraft(draft.id, body, attempt.key)
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      await refresh(app, 'inbox')
      props.onDecided('Approved.')
    },
    {
      onError(failure) {
        const shown = presentInbox(failure)
        setError({ message: shown.message, link: shown.link === 'conversation' })
        focusFirstError()
      },
    }
  )
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (approve.pending) {
      return
    }
    setError(null)
    if (draft.ungrounded && !acknowledged) {
      setError({
        message: 'Tick the box to confirm you checked this Draft before it is sent.',
        link: false,
      })
      focusFirstError()
      return
    }
    const parsed = approveDraftRequestSchema.safeParse({
      ...(edited ? { body: text } : {}),
      acknowledgeUngrounded: draft.ungrounded && acknowledged,
    })
    if (!parsed.success) {
      setError({
        message: 'Write a reply of up to 20,000 characters, or reject this Draft.',
        link: false,
      })
      focusFirstError()
      return
    }
    approve.submit(parsed.data)
  }
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-label='Approve this Draft'>
      {error === null ? null : (
        <Banner kind='error' innerRef={bannerRef}>
          {error.message}{' '}
          {error.link ? <ConversationLink conversationId={draft.conversationId} /> : null}
        </Banner>
      )}
      <TextAreaField
        label='Reply'
        hint='Change the text to send your own version. Leave it as it is to send the Agent’s.'
        value={text}
        rows={10}
        onChange={(event) => setText(event.target.value)}
      />
      {draft.ungrounded ? (
        <div className='mb-4 flex items-start gap-2'>
          <input
            id={`ack-${draft.id}`}
            type='checkbox'
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <label htmlFor={`ack-${draft.id}`}>I checked it myself and want it sent anyway.</label>
        </div>
      ) : null}
      <SubmitButton pending={approve.pending}>
        {edited ? 'Approve with edits' : 'Approve'}
      </SubmitButton>
    </form>
  )
}

function RejectForm(props: {
  readonly draft: Draft
  readonly onDecided: (notice: string) => void
}) {
  const { draft } = props
  const app = useApp()
  const [note, setNote] = useState('')
  const [error, setError] = useState<{ message: string; link: boolean } | null>(null)
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const reject = useSubmit<{ note?: string }>(
    async (body) => {
      const attempt = app.keys.begin(
        fingerprint.draftDecision(draft.id, 'reject', JSON.stringify(body))
      )
      try {
        await app.approvals.rejectDraft(draft.id, body, attempt.key)
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      await refresh(app, 'inbox')
      props.onDecided('Rejected.')
    },
    {
      onError(failure) {
        const shown = presentInbox(failure)
        setError({ message: shown.message, link: shown.link === 'conversation' })
        focusFirstError()
      },
    }
  )
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (reject.pending) {
      return
    }
    setError(null)
    const trimmed = note.trim()
    const parsed = rejectDraftRequestSchema.safeParse(trimmed === '' ? {} : { note: trimmed })
    if (!parsed.success) {
      setError({ message: 'Keep the note to 500 characters or fewer.', link: false })
      focusFirstError()
      return
    }
    reject.submit(parsed.data)
  }
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-label='Reject this Draft'>
      {error === null ? null : (
        <Banner kind='error' innerRef={bannerRef}>
          {error.message}{' '}
          {error.link ? <ConversationLink conversationId={draft.conversationId} /> : null}
        </Banner>
      )}
      <TextAreaField
        label='Why reject it? (optional)'
        hint='Your note is kept with the decision.'
        value={note}
        maxLength={MAX_DECISION_NOTE_LENGTH}
        rows={3}
        onChange={(event) => setNote(event.target.value)}
      />
      <SubmitButton pending={reject.pending} className='button-quiet'>
        Reject
      </SubmitButton>
    </form>
  )
}

function Decisions(props: { readonly draftId: string }) {
  const decisions = useDraftDecisions(props.draftId, true)
  return (
    <Section id='decisions' title='Decisions' description='Who decided this Draft, and when.'>
      <Paged
        noun='decisions'
        present={presentInbox}
        emptyText='Nobody has decided this Draft yet.'
        state={decisions.state}
      >
        <ScrollRegion label='Decisions'>
          <table className='ledger-stack' aria-label='Decisions'>
            <thead>
              <tr>
                <th scope='col'>Decision</th>
                <th scope='col'>When</th>
                <th scope='col' className='ledger-detail'>
                  Note
                </th>
              </tr>
            </thead>
            <tbody>
              {decisions.items.map((decision) => (
                <DecisionRow key={decision.id} decision={decision} />
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </Paged>
    </Section>
  )
}

function DecisionRow(props: { readonly decision: Decision }) {
  const { decision } = props
  return (
    <tr>
      <th scope='row'>
        {DECISION_WORD[decision.kind]}
        {decision.acknowledgedUngrounded ? (
          <span className='label-mono mt-1 block'>Sent although it cited no source</span>
        ) : null}
      </th>
      <td>
        <When iso={decision.decidedAt} />
      </td>
      <td className='ledger-detail'>
        {decision.note === null ? '—' : <Untrusted value={decision.note} />}
      </td>
    </tr>
  )
}
