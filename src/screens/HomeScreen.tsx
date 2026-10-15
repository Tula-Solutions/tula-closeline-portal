import { Link, type LinkProps } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import type { Call, DealImport, PlaybookDocument } from 'tula-closeline-contract'
import { type CallListItem, isUnreadable } from '~/api/sales-history'
import { Section } from '~/components/app/section'
import { StatusBadge } from '~/components/app/status-badge'
import { Skeleton } from '~/components/ui/skeleton'
import { stateLabel } from '~/data/documents'
import { can } from '~/data/permissions'
import {
  type FirstPage,
  useCallsFirstPage,
  useDocumentsFirstPage,
  useLatestImport,
  useMembersFirstPage,
  useWonDealsFirstPage,
} from '~/data/queries'
import { callStateLabel, importStateLabel } from '~/data/sales-history'
import { useRole } from '~/data/session-role'
import { reveal, useCountUp } from '~/ui/motion'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { When } from '~/ui/When'

/** What a count line knows: still loading, could not be read, or a number (with more beyond it). */
export type CountValue =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'count'; readonly count: number; readonly more: boolean }

/** A list's single first page as a count: what was read, and "more" when a next cursor came back. */
export function countOf(page: FirstPage<unknown>): CountValue {
  if (page.isPending) {
    return { kind: 'loading' }
  }
  if (page.isError) {
    return { kind: 'unavailable' }
  }
  return { kind: 'count', count: page.items.length, more: page.more }
}

/** A count as the briefing writes it: `100+` when there are more than one page held, else the number. */
export function countText(value: CountValue): string {
  return value.kind === 'count' ? `${value.count.toLocaleString()}${value.more ? '+' : ''}` : '-'
}

/** One sentence of the briefing: a large serif numeral and what it counts, linking to that page. */
function CountLine(props: {
  readonly value: CountValue
  readonly one: string
  readonly many: string
  readonly to: LinkProps['to']
  readonly what: string
}) {
  const { value } = props
  const plural = value.kind === 'count' && (value.count !== 1 || value.more)
  const words = plural ? props.many : props.one
  const numeral = useRef<HTMLSpanElement>(null)
  const more = value.kind === 'count' && value.more
  // The numeral counts up (or rises) as it arrives; assistive technology reads the final text.
  useCountUp(
    numeral,
    value.kind === 'count' ? value.count : null,
    (n) => `${n.toLocaleString()}${more ? '+' : ''}`
  )
  return (
    <li data-line className='block sm:inline'>
      <Link
        to={props.to}
        className='ink-hover rounded-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring'
      >
        {value.kind === 'loading' ? (
          <>
            <span className='sr-only'>{props.what}: loading</span>
            <span aria-hidden='true'>
              <Skeleton className='inline-block h-[0.8em] w-[1.6em] align-baseline' />
            </span>
          </>
        ) : value.kind === 'unavailable' ? (
          <span className='ink-link text-muted-foreground'>{props.what} could not be counted.</span>
        ) : (
          <>
            <span className='sr-only'>{countText(value)}</span>
            <span
              ref={numeral}
              aria-hidden='true'
              className='inline-block text-[1.9em] leading-none tracking-[-0.03em] tabular-nums lining-nums'
            />{' '}
            <span className='ink-link'>{words}.</span>
          </>
        )}
      </Link>{' '}
    </li>
  )
}

function greeting(now: Date): string {
  const hour = now.getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

/** The newest documents, from the same single page the Documents line counts. Names are text only. */
function Latest(props: { readonly documents: FirstPage<PlaybookDocument> }) {
  const recent = props.documents.items.slice(0, 8)
  return (
    <Section
      id='latest'
      title='Latest'
      description='The newest sales material in your Playbook.'
      actions={
        <Link
          to='/playbook'
          className='rounded-sm text-sm font-medium ink-link outline-hidden focus-visible:ring-2 focus-visible:ring-ring'
        >
          All documents
        </Link>
      }
    >
      {props.documents.isPending ? (
        <ul aria-hidden='true' className='m-0 list-none border-t p-0'>
          {[0, 1, 2].map((row) => (
            <li key={row} className='flex items-center gap-8 border-b py-4'>
              <Skeleton className='h-2.5 w-24' />
              <Skeleton className='h-3 flex-1' />
              <Skeleton className='h-3 w-14' />
            </li>
          ))}
        </ul>
      ) : recent.length === 0 ? (
        <p className='m-0 border-t pt-5 text-sm text-muted-foreground'>
          {props.documents.isError
            ? 'The documents could not be loaded. Open the Playbook to try again.'
            : 'Nothing yet. The first document you upload to the Playbook appears here.'}
        </p>
      ) : (
        <ol className='m-0 list-none border-t p-0'>
          {recent.map((document) => (
            <li
              key={document.id}
              className='grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-1 border-b py-3.5 sm:grid-cols-[11rem_minmax(0,1fr)_auto]'
            >
              <span className='order-2 col-span-2 font-mono text-xs text-muted-foreground sm:order-none sm:col-span-1'>
                <When iso={document.createdAt} />
              </span>
              <span className='min-w-0 text-[0.9375rem]'>
                <Untrusted value={document.fileName} />
              </span>
              <StatusBadge state={document.state}>{stateLabel(document.state)}</StatusBadge>
            </li>
          ))}
        </ol>
      )}
    </Section>
  )
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * This week in sales history: the Calls added in the last seven days (up to 8, from the same single
 * page the Calls line counts) with their state, and when the last import ran. Nothing here reads a
 * second page; file names and deal ids are text only.
 */
function ThisWeek(props: {
  readonly calls: FirstPage<CallListItem>
  readonly latestImport: FirstPage<DealImport>
  readonly now: Date
}) {
  const since = props.now.getTime() - WEEK_MS
  const recent = props.calls.items
    .filter((call): call is Call => !isUnreadable(call) && Date.parse(call.createdAt) >= since)
    .slice(0, 8)
  const lastImport = props.latestImport.items[0]
  return (
    <Section
      id='this-week'
      title='This week'
      description='Calls added in the last seven days, and the last import.'
      actions={
        <Link
          to='/sales-history/calls'
          className='rounded-sm text-sm font-medium ink-link outline-hidden focus-visible:ring-2 focus-visible:ring-ring'
        >
          All Calls
        </Link>
      }
    >
      {props.calls.isPending ? (
        <ul aria-hidden='true' className='m-0 list-none border-t p-0'>
          {[0, 1, 2].map((row) => (
            <li key={row} className='flex items-center gap-8 border-b py-4'>
              <Skeleton className='h-2.5 w-24' />
              <Skeleton className='h-3 flex-1' />
              <Skeleton className='h-3 w-14' />
            </li>
          ))}
        </ul>
      ) : (
        <ol className='m-0 list-none border-t p-0'>
          {recent.map((call) => (
            <li
              key={call.id}
              className='grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-1 border-b py-3.5 sm:grid-cols-[11rem_minmax(0,1fr)_auto]'
            >
              <span className='order-2 col-span-2 font-mono text-xs text-muted-foreground sm:order-none sm:col-span-1'>
                <When iso={call.createdAt} />
              </span>
              <span className='min-w-0 text-[0.9375rem]'>
                <Untrusted value={call.fileName} />
                <span className='ml-2 font-mono text-xs text-muted-foreground'>
                  <Untrusted value={call.dealId} />
                </span>
              </span>
              <StatusBadge state={call.state}>{callStateLabel(call.state)}</StatusBadge>
            </li>
          ))}
          {recent.length === 0 ? (
            <li className='border-b py-3.5 text-sm text-muted-foreground'>
              {props.calls.isError
                ? 'The Calls could not be loaded. Open Calls to try again.'
                : 'No Calls were added this week.'}
            </li>
          ) : null}
          {lastImport === undefined ? null : (
            <li className='grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-1 border-b py-3.5 sm:grid-cols-[11rem_minmax(0,1fr)_auto]'>
              <span className='order-2 col-span-2 font-mono text-xs text-muted-foreground sm:order-none sm:col-span-1'>
                <When iso={lastImport.createdAt} />
              </span>
              <span className='min-w-0 text-[0.9375rem]'>
                Last import
                {lastImport.appliedCount === null ? null : (
                  <span className='text-muted-foreground'>
                    , {lastImport.appliedCount.toLocaleString()} rows applied
                  </span>
                )}
              </span>
              <StatusBadge state={lastImport.state}>
                {importStateLabel(lastImport.state)}
              </StatusBadge>
            </li>
          )}
        </ol>
      )}
    </Section>
  )
}

type Next = { readonly to: LinkProps['to']; readonly label: string }

/** The home page: a dateline and greeting, the Organization's state written as sentences, and the latest documents. */
export function HomeScreen() {
  useDocumentTitle('Home')
  const role = useRole()
  const allowed = role !== null
  const documents = useDocumentsFirstPage()
  const members = useMembersFirstPage(allowed && can.viewMembers(role))
  const sales = allowed && can.manageSalesHistory(role)
  const deals = useWonDealsFirstPage(sales)
  const calls = useCallsFirstPage(sales)
  const latestImport = useLatestImport(sales)
  const header = useRef<HTMLElement>(null)
  // The briefing's lines rise into place one after another, 70 ms apart, once per visit.
  useEffect(() => {
    reveal(header.current?.querySelectorAll('[data-line]') ?? [], {
      step: 70,
      rise: '0.3em',
      duration: 360,
    })
  }, [])
  if (role === null) {
    return null
  }
  const now = new Date()
  const next: Next[] = []
  if (can.managePlaybook(role)) {
    next.push({ to: '/playbook', label: 'Upload documents' })
  }
  if (can.manageInvitations(role)) {
    next.push({ to: '/invitations', label: 'Invite people' })
  }
  if (can.searchDocuments(role)) {
    next.push({ to: '/playbook/search', label: 'Search the Playbook' })
  }
  if (sales) {
    next.push({ to: '/sales-history/calls', label: 'Upload a Call' })
  }
  return (
    <div className='flex flex-col gap-14'>
      <header ref={header} className='grid gap-10 lg:grid-cols-12 lg:gap-12'>
        <div className='lg:col-span-8'>
          <p data-line className='m-0 font-serif text-lg text-muted-foreground italic'>
            {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className='sr-only'>Home</h1>
          <p
            data-line
            className='mt-2 mb-0 font-serif text-[2.5rem] leading-[1.02] font-normal tracking-[-0.022em] md:text-[3.5rem]'
          >
            {greeting(now)}.
          </p>
          <ul
            // biome-ignore lint/a11y/noRedundantRoles: Safari and VoiceOver drop the role of a list-style: none list.
            role='list'
            aria-label='Your Organization in numbers'
            className='mt-8 mb-0 max-w-[34ch] list-none p-0 font-serif text-[1.625rem] leading-[1.3] tracking-[-0.01em] md:text-[2rem]'
          >
            <CountLine
              value={countOf(documents)}
              one='Document in the Playbook'
              many='Documents in the Playbook'
              to='/playbook'
              what='Documents'
            />
            {sales ? (
              <CountLine
                value={countOf(deals)}
                one='won Deal in search'
                many='won Deals in search'
                to='/sales-history/deals'
                what='Won Deals'
              />
            ) : null}
            {sales ? (
              <CountLine
                value={countOf(calls)}
                one='Call on record'
                many='Calls on record'
                to='/sales-history/calls'
                what='Calls'
              />
            ) : null}
            {can.viewMembers(role) ? (
              <CountLine
                value={countOf(members)}
                one='Member in the Organization'
                many='Members in the Organization'
                to='/members'
                what='Members'
              />
            ) : null}
          </ul>
        </div>
        {next.length > 0 ? (
          <nav
            data-line
            aria-labelledby='next-heading'
            className='self-end lg:col-span-4 lg:border-l lg:pl-8'
          >
            <h2 id='next-heading' className='label-mono m-0 mb-3 font-mono'>
              Next
            </h2>
            <ul className='m-0 flex list-none flex-col gap-2 p-0'>
              {next.map((item) => (
                <li key={item.label}>
                  <Link
                    to={item.to}
                    className='rounded-sm text-[0.9375rem] font-medium ink-link outline-hidden focus-visible:ring-2 focus-visible:ring-ring'
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </header>
      {sales ? <ThisWeek calls={calls} latestImport={latestImport} now={now} /> : null}
      <Latest documents={documents} />
    </div>
  )
}
