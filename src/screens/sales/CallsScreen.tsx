import { getRouteApi, Link } from '@tanstack/react-router'
import { type RefObject, useRef, useState } from 'react'
import {
  CALL_STATES,
  type Call,
  type CallState,
  callStateSchema,
  dealRecordIdSchema,
  repChangeAllowed,
  repChoiceSuits,
} from 'tula-closeline-contract'
import { isUnreadable } from '~/api/sales-history'
import { presentSales } from '~/api/sales-messages'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { StatusBadge } from '~/components/app/status-badge'
import { refresh, useCallSpeakers, useCalls, useDeal, useRights } from '~/data/queries'
import {
  CALL_FILTER_LABEL,
  CALL_PENDING_STATES,
  callFailureWords,
  callStateLabel,
  inSearchWords,
  SALES_POLL_SCHEDULE_MS,
} from '~/data/sales-history'
import { usePendingPoll } from '~/data/use-pending-poll'
import { CallUpload } from '~/screens/sales/CallUpload'
import { RecordingUpload } from '~/screens/sales/RecordingUpload'
import { Banner } from '~/ui/Banner'
import { Confirm } from '~/ui/Confirm'
import { Paged } from '~/ui/Paged'
import { plain } from '~/ui/plain'
import { ScrollRegion } from '~/ui/ScrollRegion'
import { SelectField } from '~/ui/SelectField'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useSubmit } from '~/ui/useSubmit'
import { formatWhen, When } from '~/ui/When'

const REP_WHY_ID = 'rep-change-why'

const route = getRouteApi('/_app/sales-history/calls/')

/** Calls: upload a Transcript or Recording, then follow each Call, change its Rep, delete or restore it. */
export function CallsScreen() {
  useDocumentTitle('Calls')
  // Checked again here: only an opaque Deal id is ever used from the address.
  const parsedDeal = dealRecordIdSchema.safeParse(route.useSearch().deal)
  const dealRecordId = parsedDeal.success ? parsedDeal.data : undefined
  const [state, setState] = useState<CallState | undefined>(undefined)
  const [notice, setNotice] = useState('')
  const calls = useCalls({ state, dealRecordId })
  const headingRef = useRef<HTMLHeadingElement>(null)
  const poll = usePendingPoll(
    calls.items
      .filter((call) => !isUnreadable(call) && CALL_PENDING_STATES.includes(call.state))
      .map((call) => call.id),
    calls.refetch,
    SALES_POLL_SCHEDULE_MS
  )
  return (
    <>
      <PageHeader
        eyebrow='Sales history'
        title='Calls'
        description='A Call is one past conversation, uploaded as a Transcript or a Recording for a Deal. Only ready Calls of won Deals are used in search.'
        headingRef={headingRef}
        headingProps={{ tabIndex: -1 }}
      />
      <div className='page-stack'>
        <RightsNotice />
        <div className='panel-grid'>
          <CallUpload />
          <RecordingUpload />
        </div>
        <div className='flex flex-wrap items-end justify-between gap-3 border-t border-rule-strong pt-4'>
          <h2 className='m-0'>All Calls</h2>
          <SelectField
            inline
            label='Show'
            name='state'
            value={state ?? ''}
            onChange={(event) => {
              const parsed = callStateSchema.safeParse(event.target.value)
              setState(parsed.success ? parsed.data : undefined)
              setNotice('')
            }}
            options={[
              { value: '', text: 'All current Calls' },
              ...CALL_STATES.map((value) => ({ value, text: CALL_FILTER_LABEL[value] })),
            ]}
          />
        </div>
        {dealRecordId === undefined ? null : <DealFilter id={dealRecordId} />}
        <p role='status' aria-label='Notice' className='notice'>
          {notice}
        </p>
        {poll.paused ? (
          <Banner kind='info'>
            Some Calls are still being processed, but we stopped checking for updates.{' '}
            <button type='button' className='button button-quiet' onClick={poll.resume}>
              Check again
            </button>
          </Banner>
        ) : null}
        <p className='hint' id={REP_WHY_ID}>
          The Rep can be changed when the Call is ready, waiting for a Rep, or failed because of the
          Rep.
        </p>
        <Paged
          noun='Calls'
          emptyText='There are no Calls to show.'
          emptyHint='Upload a Transcript or a Recording above to add the first one.'
          state={calls.state}
        >
          <ScrollRegion label='Calls'>
            <table>
              <thead>
                <tr>
                  <th scope='col'>File</th>
                  <th scope='col'>Deal</th>
                  <th scope='col'>Status</th>
                  <th scope='col'>Search</th>
                  <th scope='col'>Rep</th>
                  <th scope='col'>Added</th>
                  <th scope='col'>Actions</th>
                </tr>
              </thead>
              <tbody>
                {calls.items.map((call) =>
                  isUnreadable(call) ? (
                    <tr key={call.id}>
                      <td colSpan={7}>
                        This Call cannot be shown. Reload the page; if it stays, contact support.
                      </td>
                    </tr>
                  ) : (
                    <CallRow key={call.id} call={call} onDone={setNotice} heading={headingRef} />
                  )
                )}
              </tbody>
            </table>
          </ScrollRegion>
        </Paged>
      </div>
    </>
  )
}

/** Before the upload forms: says that the rights must be confirmed first, while they are not. */
function RightsNotice() {
  const rights = useRights(true)
  if (rights.data === undefined || rights.data.confirmed) {
    return null
  }
  return (
    <Banner kind='info'>
      Confirm that your Organization may share these Calls before you upload anything.{' '}
      <Link to='/sales-history/rights' search={{ from: '/sales-history/calls' }}>
        Confirm the rights
      </Link>
    </Banner>
  )
}

function DealFilter(props: { readonly id: string }) {
  const deal = useDeal(props.id)
  return (
    <p>
      Calls of Deal {deal.data === undefined ? null : <Untrusted value={deal.data.dealId} />}{' '}
      <Link to='/sales-history/calls'>Show all Calls</Link>
    </p>
  )
}

function RepText(props: { readonly rep: Call['rep'] }) {
  if (props.rep === null) {
    return <>-</>
  }
  if (props.rep.by === 'speaker') {
    return <Untrusted value={props.rep.label} />
  }
  return <>{props.rep.channel === 'left' ? 'Left channel' : 'Right channel'}</>
}

function CallRow(props: {
  readonly call: Call
  readonly onDone: (notice: string) => void
  readonly heading: RefObject<HTMLHeadingElement | null>
}) {
  const { call } = props
  const app = useApp()
  const label = plain(call.fileName, 'Call')
  const errorId = `${call.id}-error`
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  // Null until the person touches the select; a choice whose speaker is no longer in the Call is ignored.
  const [pick, setPick] = useState<string | null>(null)
  const currentRep = call.rep?.by === 'speaker' ? call.rep.label : null
  const preset = currentRep !== null && call.speakerLabels.includes(currentRep) ? currentRep : ''
  const chosen = pick !== null && call.speakerLabels.includes(pick) ? pick : preset
  const canChange = repChangeAllowed(call.state, call.failureReason)
  // What each speaker said comes from reading this one Call (a page of Calls does not carry it), only while the picker is open.
  const speakers = useCallSpeakers(call.id, editing && canChange).data?.speakers

  const remove = useSubmit<void>(
    async () => {
      setError(null)
      const gone = await app.salesHistory.deleteCall(call.id)
      await refresh(app, 'calls').catch(() => undefined)
      props.onDone(
        gone.purgeAt === null
          ? `Deleted ${label}.`
          : `Deleted ${label}. You can restore it until ${formatWhen(gone.purgeAt)}.`
      )
      props.heading.current?.focus()
    },
    { onError: (failure) => setError(presentSales(failure, 'call-delete').message) }
  )
  const restore = useSubmit<void>(
    async () => {
      setError(null)
      await app.salesHistory.restoreCall(call.id)
      await refresh(app, 'calls').catch(() => undefined)
      props.onDone(`Restored ${label}. It is processed again.`)
      props.heading.current?.focus()
    },
    { onError: (failure) => setError(presentSales(failure, 'call-restore').message) }
  )
  const changeRep = useSubmit<string>(
    async (chosen) => {
      setError(null)
      await app.salesHistory.setCallRep(call.id, chosen)
      setEditing(false)
      props.onDone(
        `Rep of ${label} changed. The Call is out of search until it has been processed again.`
      )
      await refresh(app, 'calls').catch(() => undefined)
    },
    { onError: (failure) => setError(presentSales(failure, 'call-rep').message) }
  )

  return (
    <tr>
      <th scope='row'>
        <Untrusted value={call.fileName} />
      </th>
      <td>
        {/* The address carries the opaque id; the customer's deal id is text only. */}
        <Link to='/sales-history/deals/$dealRecordId' params={{ dealRecordId: call.dealRecordId }}>
          <Untrusted value={call.dealId} />
        </Link>
      </td>
      <td>
        <StatusBadge state={call.state}>{callStateLabel(call.state)}</StatusBadge>
        {call.state === 'awaiting_rep' ? (
          <p className='hint'>
            Transcribed. Choose which speaker is the Rep with Change Rep, so the Call can be
            processed.
          </p>
        ) : null}
        {call.failureReason === null ? null : (
          <p className='hint'>{callFailureWords(call.failureReason)}</p>
        )}
        {call.state === 'deleted' && call.purgeAt !== null ? (
          <p className='hint'>
            Restorable until <When iso={call.purgeAt} />
          </p>
        ) : null}
      </td>
      <td>{inSearchWords(call)}</td>
      <td>
        <RepText rep={call.rep} />
      </td>
      <td>
        <When iso={call.createdAt} />
      </td>
      <td>
        {call.state === 'deleted' ? (
          <button
            type='button'
            className='button button-quiet'
            aria-disabled={restore.pending}
            aria-label={restore.pending ? `Restoring ${label}` : `Restore ${label}`}
            aria-describedby={error ? errorId : undefined}
            onClick={() => restore.submit()}
          >
            {restore.pending ? 'Restoring...' : 'Restore'}
          </button>
        ) : (
          <>
            <button
              type='button'
              className='button button-quiet'
              aria-disabled={!canChange}
              aria-label={`Change Rep of ${label}`}
              aria-describedby={canChange ? undefined : REP_WHY_ID}
              onClick={() => {
                if (canChange) {
                  setEditing((now) => !now)
                }
              }}
            >
              Change Rep
            </button>
            {editing && canChange ? (
              <form
                noValidate
                onSubmit={(event) => {
                  event.preventDefault()
                  if (chosen === '') {
                    setError('Choose a speaker first.')
                    return
                  }
                  if (chosen === currentRep) {
                    setError('That speaker is already the Rep. Choose a different one.')
                    return
                  }
                  if (!repChoiceSuits(call.kind, { by: 'speaker', label: chosen }, 'change')) {
                    setError('Pick one of the speakers in this Call.')
                    return
                  }
                  changeRep.submit(chosen)
                }}
              >
                {speakers === undefined || speakers.length === 0 ? null : (
                  <ul className='plain-list' aria-label='What each speaker said'>
                    {speakers.map((speaker) => (
                      <li key={speaker.label}>
                        <strong>
                          <Untrusted value={speaker.label} />
                        </strong>
                        {': '}
                        {/* Transcript text: shown as text only, whole, never as markup. */}
                        <bdi>{speaker.excerpt}</bdi>
                      </li>
                    ))}
                  </ul>
                )}
                <SelectField
                  label={`Rep for ${label}`}
                  name='rep'
                  value={chosen}
                  onChange={(event) => setPick(event.target.value)}
                  options={[
                    { value: '', text: 'Choose a speaker' },
                    ...call.speakerLabels.map((speaker) => ({ value: speaker, text: speaker })),
                  ]}
                />
                <button type='submit' className='button' aria-disabled={changeRep.pending}>
                  {changeRep.pending ? 'Saving...' : 'Save Rep'}
                </button>
              </form>
            ) : null}
            <Confirm
              label='Delete'
              accessibleName={`Delete ${label}`}
              pendingAccessibleName={`Deleting ${label}`}
              pendingLabel='Deleting...'
              question={
                <>
                  Delete <Untrusted value={call.fileName} />? It is hidden from search at once and
                  can be restored for a while before it is removed for good.
                </>
              }
              tone='quiet-destructive'
              confirmLabel='Delete Call'
              pending={remove.pending}
              describedBy={error ? errorId : undefined}
              onConfirm={() => remove.submit()}
            />
          </>
        )}
        {error ? (
          <p className='field-error' id={errorId} role='alert'>
            <strong>Error:</strong> {error}
          </p>
        ) : null}
      </td>
    </tr>
  )
}
