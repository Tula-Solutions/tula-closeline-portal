import { type FormEvent, useRef, useState } from 'react'
import {
  AUDIT_ACTOR_KINDS,
  type AuditActorKind,
  type AuditEvent,
  listAuditEventsQuerySchema,
  MAX_AUDIT_RANGE_DAYS,
  MAX_AUDIT_VERIFY_COUNT,
} from 'tula-closeline-contract'
import { type AuditFilter, CSV_PAGE_SIZE } from '~/api/audit'
import { presentAudit } from '~/api/audit-messages'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { Section } from '~/components/app/section'
import { can } from '~/data/permissions'
import { useAuditEvents } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
import { Paged } from '~/ui/Paged'
import { SelectField } from '~/ui/SelectField'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useSubmit } from '~/ui/useSubmit'
import { When } from '~/ui/When'

const DAY_MS = 24 * 60 * 60 * 1000

/** The most CSV pages one download joins (20,000 events); past it the person is asked to narrow the filters. */
const MAX_CSV_PAGES = 20

const ACTOR_WORD: Record<AuditActorKind, string> = {
  member: 'Member',
  agent: 'Agent',
  api_key: 'API key',
  system: 'System',
}

const ANYONE = 'any'

/** The words for who did it. Ids are shown as they are; a name would be a second lookup this log does not make. */
function Actor(props: { readonly actor: AuditEvent['actor'] }) {
  const { actor } = props
  switch (actor.kind) {
    case 'member':
      return (
        <>
          Member <Untrusted value={actor.membershipId} />
        </>
      )
    case 'agent':
      return <>{actor.agentKind === 'inbound' ? 'Inbound Agent' : 'Outbound Agent'}</>
    case 'api_key':
      return (
        <>
          API key <Untrusted value={actor.apiKeyId} />
        </>
      )
    case 'system':
      return <>System</>
  }
}

/** The audit log of the Organization: Owners, Admins and Managers read it; a Rep never reaches it. */
export function AuditScreen() {
  useDocumentTitle('Audit log')
  const role = useRole()
  if (role === null) {
    return null
  }
  if (!can.viewAudit(role)) {
    return (
      <>
        <PageHeader eyebrow='Organization' title='Audit log' />
        <p role='status' className='notice'>
          Only an Owner, Admin or Manager can read the audit log. Ask one of them if you need to
          know who changed something.
        </p>
      </>
    )
  }
  return <AuditLog canManage={can.manageAudit(role)} />
}

type Draft = {
  actorKind: string
  actorId: string
  action: string
  prospectId: string
  from: string
  to: string
}

const EMPTY: Draft = {
  actorKind: ANYONE,
  actorId: '',
  action: '',
  prospectId: '',
  from: '',
  to: '',
}

/** The filter a draft means, or the sentence that says why it cannot be asked. */
function filterOf(draft: Draft): { filter: AuditFilter } | { problem: string } {
  const from = draft.from === '' ? undefined : `${draft.from}T00:00:00.000Z`
  const to = draft.to === '' ? undefined : `${draft.to}T23:59:59.999Z`
  if (from !== undefined && to !== undefined) {
    if (Date.parse(to) < Date.parse(from)) {
      return { problem: 'The end date is before the start date.' }
    }
    if (Date.parse(to) - Date.parse(from) > MAX_AUDIT_RANGE_DAYS * DAY_MS) {
      return {
        problem: `That date range is longer than ${MAX_AUDIT_RANGE_DAYS} days. Choose a shorter one.`,
      }
    }
  }
  const action = draft.action.trim()
  if (action !== '' && !listAuditEventsQuerySchema.safeParse({ action }).success) {
    return { problem: 'Write an action as area.verb, such as prospect.updated.' }
  }
  const actorKind = AUDIT_ACTOR_KINDS.find((kind) => kind === draft.actorKind)
  const candidate = {
    ...(actorKind ? { actorKind } : {}),
    ...(draft.actorId.trim() === '' ? {} : { actorId: draft.actorId.trim() }),
    ...(action === '' ? {} : { action }),
    ...(draft.prospectId.trim() === '' ? {} : { prospectId: draft.prospectId.trim() }),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }
  if (!listAuditEventsQuerySchema.safeParse(candidate).success) {
    return { problem: 'Check the ids and dates, then apply the filters again.' }
  }
  return { filter: candidate }
}

function AuditLog(props: { readonly canManage: boolean }) {
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [filter, setFilter] = useState<AuditFilter>({})
  const [problem, setProblem] = useState<string | null>(null)
  const events = useAuditEvents(filter, true)
  const apply = (event: FormEvent) => {
    event.preventDefault()
    const made = filterOf(draft)
    if ('problem' in made) {
      setProblem(made.problem)
      return
    }
    setProblem(null)
    setFilter(made.filter)
  }
  const clear = () => {
    setDraft(EMPTY)
    setProblem(null)
    setFilter({})
  }
  const set = (change: Partial<Draft>) => setDraft((now) => ({ ...now, ...change }))
  return (
    <>
      <PageHeader
        eyebrow='Organization'
        title='Audit log'
        description='Every change to your Organization, newest first: who did it, what it was done to, and when. It holds ids and labels, never the text of a Message. A Manager sees only events about their Team’s Prospects.'
        actions={props.canManage ? <DownloadCsv filter={filter} /> : undefined}
      />
      <form
        className='audit-filters'
        aria-label='Filters'
        onSubmit={apply}
        noValidate
        data-slot='audit-filters'
      >
        <SelectField
          label='Actor'
          name='actorKind'
          value={draft.actorKind}
          options={[
            { value: ANYONE, text: 'Anyone' },
            ...AUDIT_ACTOR_KINDS.map((kind) => ({ value: kind, text: ACTOR_WORD[kind] })),
          ]}
          onChange={(event) => set({ actorKind: event.target.value })}
        />
        <Field
          label='Actor id'
          name='actorId'
          autoComplete='off'
          value={draft.actorId}
          onChange={(event) => set({ actorId: event.target.value })}
        />
        <Field
          label='Action'
          name='action'
          autoComplete='off'
          hint='Written area.verb.'
          value={draft.action}
          onChange={(event) => set({ action: event.target.value })}
        />
        <Field
          label='Prospect id'
          name='prospectId'
          autoComplete='off'
          value={draft.prospectId}
          onChange={(event) => set({ prospectId: event.target.value })}
        />
        <Field
          label='From'
          name='from'
          type='date'
          value={draft.from}
          onChange={(event) => set({ from: event.target.value })}
        />
        <Field
          label='To'
          name='to'
          type='date'
          value={draft.to}
          onChange={(event) => set({ to: event.target.value })}
        />
        <div className='row-actions audit-filter-actions'>
          <button type='submit' className='button'>
            Apply filters
          </button>
          <button type='button' className='button button-quiet' onClick={clear}>
            Clear filters
          </button>
        </div>
        {problem === null ? null : (
          <div className='audit-filter-problem'>
            <Banner kind='error'>{problem}</Banner>
          </div>
        )}
      </form>
      <div className='grid items-start gap-12 lg:grid-cols-12'>
        <div
          className={
            props.canManage
              ? 'flex min-w-0 flex-col gap-4 lg:order-1 lg:col-span-8'
              : 'flex min-w-0 flex-col gap-4 lg:col-span-12'
          }
        >
          <h2 className='m-0 border-t border-rule-strong pt-4'>Events</h2>
          <Paged
            noun='events'
            emptyText='There are no audit events for these filters.'
            emptyHint='Widen the dates or clear the filters.'
            state={events.state}
            present={presentAudit}
          >
            <ul
              className='m-0 list-none divide-y border-y p-0 motion-safe:animate-fade'
              aria-label='Audit events'
            >
              {events.items.map((event) => (
                <EventItem key={event.id} event={event} />
              ))}
            </ul>
          </Paged>
        </div>
        {props.canManage ? (
          <Section
            id='chain'
            title='Hash chain'
            description='Each event holds the hash of the one before it, so a changed or removed event breaks the chain.'
            className='lg:sticky lg:top-8 lg:order-2 lg:col-span-4'
          >
            <VerifyChain />
          </Section>
        ) : null}
      </div>
    </>
  )
}

function EventItem(props: { readonly event: AuditEvent }) {
  const { event } = props
  const details = Object.entries(event.metadata)
  return (
    <li className='py-4'>
      <div className='key-head'>
        <h3 className='item-title key-name m-0 font-mono text-base font-normal'>
          <Untrusted value={event.action} />
        </h3>
        <span className='label-mono'>
          <When iso={event.occurredAt} />
        </span>
      </div>
      <dl className='key-facts audit-facts'>
        <div>
          <dt>Actor</dt>
          <dd>
            <Actor actor={event.actor} />
          </dd>
        </div>
        {event.subject === null ? null : (
          <div>
            <dt>Subject</dt>
            <dd>
              <Untrusted value={`${event.subject.type} ${event.subject.id}`} />
            </dd>
          </div>
        )}
        {event.prospectId === null ? null : (
          <div>
            <dt>Prospect</dt>
            <dd>
              <Untrusted value={event.prospectId} />
            </dd>
          </div>
        )}
        {event.instructionVersion === null ? null : (
          <div>
            <dt>Instructions</dt>
            <dd>Version {event.instructionVersion}</dd>
          </div>
        )}
        {event.requestId === null ? null : (
          <div>
            <dt>Request</dt>
            <dd>
              <Untrusted value={event.requestId} />
            </dd>
          </div>
        )}
      </dl>
      {details.length === 0 ? null : (
        <dl className='key-facts audit-details'>
          {details.map(([name, value]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>
                <Untrusted value={value === null ? 'none' : String(value)} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className='hint audit-hash'>
        <span className='sr-only'>Sequence </span>#{event.sequence} · hash{' '}
        <span className='secret-prefix'>{event.hash.slice(0, 12)}</span>
      </p>
    </li>
  )
}

type Pass = {
  readonly checked: number
  readonly firstBrokenSequence: number | null
  readonly nextSequence: number | null
}

function VerifyChain() {
  const app = useApp()
  const [pass, setPass] = useState<Pass | null>(null)
  const [error, setError] = useState<string | null>(null)
  const total = useRef(0)
  const check = useSubmit<number | undefined>(
    async (from) => {
      setError(null)
      const answer = await app.audit.verifyAuditLog(from, MAX_AUDIT_VERIFY_COUNT)
      total.current = (from === undefined ? 0 : total.current) + answer.checked
      setPass({
        checked: total.current,
        firstBrokenSequence: answer.firstBrokenSequence,
        nextSequence: answer.nextSequence,
      })
    },
    { onError: (failure) => setError(presentAudit(failure).message) }
  )
  return (
    <div className='flex flex-col gap-4'>
      {error === null ? null : <Banner kind='error'>{error}</Banner>}
      <div role='status' className='notice'>
        {pass === null ? null : pass.firstBrokenSequence !== null ? (
          <>
            The chain is broken at sequence {pass.firstBrokenSequence}. Do not rely on events from
            there on, and report it.
          </>
        ) : (
          <>
            Checked {pass.checked} events. The chain is intact
            {pass.nextSequence === null ? '.' : ' so far; there are more to check.'}
          </>
        )}
      </div>
      <div className='row-actions'>
        {pass !== null && pass.firstBrokenSequence === null && pass.nextSequence !== null ? (
          <button
            type='button'
            className='button'
            aria-disabled={check.pending}
            onClick={() => check.submit(pass.nextSequence ?? undefined)}
          >
            {check.pending ? 'Checking...' : `Check the next ${MAX_AUDIT_VERIFY_COUNT}`}
          </button>
        ) : (
          <button
            type='button'
            className='button'
            aria-disabled={check.pending}
            onClick={() => check.submit(undefined)}
          >
            {check.pending ? 'Checking...' : 'Check the chain'}
          </button>
        )}
      </div>
    </div>
  )
}

/** Joins the CSV pages that match the filter into one file and hands it to the browser. */
function DownloadCsv(props: { readonly filter: AuditFilter }) {
  const app = useApp()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)
  const download = async () => {
    if (busy) {
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      let text = ''
      let cursor: string | undefined
      let more = true
      for (let pages = 0; more && pages < MAX_CSV_PAGES; pages += 1) {
        const got = await app.audit.downloadAuditCsv(props.filter, cursor)
        // Every page repeats the header row; the file keeps the first.
        text += pages === 0 ? got.csv : got.csv.slice(got.csv.indexOf('\n') + 1)
        cursor = got.nextCursor ?? undefined
        more = cursor !== undefined
      }
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'audit-log.csv'
      document.body.append(link)
      link.click()
      link.remove()
      // Some browsers start the save only after click() returns, so the URL outlives the click.
      setTimeout(() => URL.revokeObjectURL(url), 1_000)
      if (more) {
        setMessage({
          kind: 'info',
          text: `The file holds the first ${MAX_CSV_PAGES * CSV_PAGE_SIZE} events, oldest first. Narrow the dates to get the rest.`,
        })
      }
    } catch (error) {
      setMessage({ kind: 'error', text: presentAudit(error).message })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className='flex flex-col items-end gap-2'>
      <button
        type='button'
        className='button button-quiet'
        aria-disabled={busy}
        onClick={() => void download()}
      >
        {busy ? 'Preparing the file...' : 'Download CSV'}
      </button>
      {message === null ? null : (
        <Banner kind={message.kind} className='m-0'>
          {message.text}
        </Banner>
      )}
    </div>
  )
}
