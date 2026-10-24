import { Link } from '@tanstack/react-router'
import { useId, useRef, useState } from 'react'
import type {
  CitationRef,
  ResolvedCitation,
  Suggestion,
  SuggestionKind,
} from 'tula-closeline-contract'
import { alreadyDecided, presentSuggestion } from '~/api/suggestion-messages'
import { useApp } from '~/app-context'
import { Button } from '~/components/ui/button'
import { refresh, useResolvedCitations } from '~/data/queries'
import { Banner } from '~/ui/Banner'
import { TextAreaField } from '~/ui/TextAreaField'
import { useSubmit } from '~/ui/useSubmit'
import { formatWhen } from '~/ui/When'

const KIND_LABEL: Readonly<Record<SuggestionKind, string>> = {
  objection_answer: 'Objection answer',
  discovery_question: 'Discovery question',
  closing_move: 'Closing move',
}

const LINK =
  'rounded-sm font-medium text-foreground underline decoration-border-strong underline-offset-4 outline-hidden hover:decoration-current focus-visible:ring-2 focus-visible:ring-ring'

type Decision = { readonly kind: 'accept'; readonly text?: string } | { readonly kind: 'reject' }

function sameMoment(ref: CitationRef, item: ResolvedCitation): boolean {
  return (
    ref.kind === 'moment' &&
    item.kind === 'moment' &&
    item.callId === ref.callId &&
    item.momentIndex === ref.momentIndex
  )
}

/** What one cited Moment said, once its text has been read; "no longer available" when it was removed. */
function Footnote(props: {
  readonly n: number
  readonly dealRecordId: Suggestion['provenance']['dealRecordId']
  readonly reference: CitationRef
  readonly refs: readonly CitationRef[]
}) {
  const resolved = useResolvedCitations(props.refs, true)
  const item = resolved.data?.items.find((candidate) => sameMoment(props.reference, candidate))
  return (
    <aside
      aria-label={`Moment ${props.n}`}
      className='mt-4 border-l border-rule-strong pl-4 motion-safe:animate-fade'
    >
      <p className='label-mono m-0 mb-2'>Moment {props.n}</p>
      {resolved.isPending ? (
        <p role='status' className='hint'>
          Loading Moment {props.n}...
        </p>
      ) : resolved.isError ? (
        <Banner kind='error' className='mb-0'>
          {presentSuggestion(resolved.error).message}{' '}
          <button type='button' className={LINK} onClick={() => resolved.refetch()}>
            Try again
          </button>
        </Banner>
      ) : item?.state === 'available' && item.kind === 'moment' ? (
        <>
          <p className='label-mono m-0 mt-1'>The Prospect said</p>
          <blockquote className='m-0 mt-1 font-serif text-base leading-relaxed'>
            <bdi>{item.prospect}</bdi>
          </blockquote>
          <p className='label-mono m-0 mt-3'>The Rep said next</p>
          <blockquote className='m-0 mt-1 font-serif text-base leading-relaxed'>
            <bdi>{item.repNext}</bdi>
          </blockquote>
        </>
      ) : (
        <p className='hint'>This Moment is no longer available.</p>
      )}
      <p className='mt-3 mb-0 text-[0.8125rem]'>
        {/* There is no page for one Call: this lists the Calls of its Deal. */}
        <Link to='/sales-history/calls' search={{ deal: props.dealRecordId }} className={LINK}>
          Calls of this Deal
        </Link>
      </p>
    </aside>
  )
}

/**
 * One Suggestion set like a ledger entry: the proposed text in the display serif with its
 * citations as numbered superscripts, the originating Deal and the kind as quiet metadata below,
 * and, while it is pending, Accept, Edit and Reject. The text is the Organization's own data and
 * is shown as text only.
 */
export function SuggestionEntry(props: {
  readonly suggestion: Suggestion
  /** Called with the words to show when this Suggestion was decided here. */
  readonly onDecided: (message: string) => void
  /** Called when the service says someone else decided it first. */
  readonly onAlreadyDecided: () => void
}) {
  const app = useApp()
  const { suggestion } = props
  const { dealRecordId, moments } = suggestion.provenance
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(suggestion.text)
  const [problem, setProblem] = useState('')
  const [error, setError] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const footnoteId = useId()
  const decide = useSubmit<Decision>(
    async (decision) => {
      const text = decision.kind === 'accept' ? decision.text : undefined
      const attempt = app.keys.begin(JSON.stringify([decision.kind, suggestion.id, text ?? null]))
      try {
        if (decision.kind === 'accept') {
          await app.playbook.acceptSuggestion(suggestion.id, text, attempt.key)
        } else {
          await app.playbook.rejectSuggestion(suggestion.id, attempt.key)
        }
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      props.onDecided(decision.kind === 'accept' ? 'Accepted.' : 'Rejected.')
      await refresh(app, 'suggestions')
    },
    {
      onError(failure) {
        if (alreadyDecided(failure)) {
          props.onAlreadyDecided()
          return
        }
        setError(presentSuggestion(failure).message)
      },
    }
  )
  const refs = useRef(moments).current
  const pending = suggestion.status === 'pending'
  const acceptEdited = () => {
    const text = draft.trim()
    if (text === '') {
      setProblem('Write the text to accept, or cancel.')
      return
    }
    setProblem('')
    setError('')
    decide.submit({ kind: 'accept', text })
  }
  return (
    <li className='border-b py-7'>
      {editing ? (
        <>
          <TextAreaField
            label='Suggestion text'
            value={draft}
            maxLength={1000}
            error={problem || undefined}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className='flex flex-wrap items-center gap-3'>
            <Button size='sm' disabled={decide.pending} onClick={acceptEdited}>
              Accept edited text
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={decide.pending}
              onClick={() => {
                setEditing(false)
                setDraft(suggestion.text)
                setProblem('')
              }}
            >
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <p className='m-0 max-w-[62ch] font-serif text-[1.375rem] leading-snug tracking-[-0.01em]'>
          <bdi>{suggestion.text}</bdi>
          {moments.map((moment, index) => (
            <sup key={`${moment.callId}-${moment.momentIndex ?? ''}`} className='ml-0.5'>
              <button
                type='button'
                aria-label={`Open Moment ${index + 1}`}
                aria-expanded={open === index}
                aria-controls={open === index ? footnoteId : undefined}
                className='cursor-pointer rounded-sm px-1 font-mono text-[0.6875rem] font-medium text-foreground underline decoration-border-strong underline-offset-2 outline-hidden hover:decoration-current focus-visible:ring-2 focus-visible:ring-ring'
                onClick={() => setOpen(open === index ? null : index)}
              >
                {index + 1}
              </button>
            </sup>
          ))}
        </p>
      )}
      <p className='hint mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1'>
        <span className='label-mono'>{KIND_LABEL[suggestion.kind]}</span>
        <span>
          {/* There is no Deal name here, only its id, so the end of the id tells Deals apart. */}
          <Link to='/sales-history/deals/$dealRecordId' params={{ dealRecordId }} className={LINK}>
            Deal …{dealRecordId.slice(-6)}
          </Link>
        </span>
        <time dateTime={suggestion.createdAt}>{formatWhen(suggestion.createdAt)}</time>
        {pending ? null : (
          <span>
            {suggestion.status === 'accepted' ? 'Accepted' : 'Rejected'}
            {suggestion.decidedAt ? ` ${formatWhen(suggestion.decidedAt)}` : ''}
          </span>
        )}
      </p>
      {open !== null && refs[open] ? (
        <div id={footnoteId}>
          <Footnote n={open + 1} dealRecordId={dealRecordId} reference={refs[open]} refs={refs} />
        </div>
      ) : null}
      {error ? (
        <Banner kind='error' className='mt-4 mb-0'>
          {error}
        </Banner>
      ) : null}
      {pending && !editing ? (
        <div className='mt-5 flex flex-wrap items-center gap-3'>
          <Button
            size='sm'
            disabled={decide.pending}
            onClick={() => {
              setError('')
              decide.submit({ kind: 'accept' })
            }}
          >
            Accept
          </Button>
          <Button
            size='sm'
            variant='outline'
            disabled={decide.pending}
            onClick={() => {
              setEditing(true)
              setError('')
            }}
          >
            Edit
          </Button>
          <Button
            size='sm'
            variant='ghost-destructive'
            disabled={decide.pending}
            onClick={() => {
              setError('')
              decide.submit({ kind: 'reject' })
            }}
          >
            Reject
          </Button>
        </div>
      ) : null}
    </li>
  )
}
