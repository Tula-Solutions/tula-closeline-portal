import { Link, type LinkProps } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { presentSales } from '~/api/sales-messages'
import { PageHeader } from '~/components/app/page-header'
import { Skeleton } from '~/components/ui/skeleton'
import { can } from '~/data/permissions'
import {
  type FirstPage,
  useCallsFirstPage,
  useDealsFirstPage,
  useLatestImport,
  useRights,
  useWonDealsFirstPage,
} from '~/data/queries'
import { useRole } from '~/data/session-role'
import { Banner } from '~/ui/Banner'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { formatDay } from '~/ui/When'

type Area = {
  readonly to: LinkProps['to']
  readonly title: string
  readonly text: string
  /** A live figure ("3 Deals, 2 won"): null while it loads, absent for a line that has none. */
  readonly figure?: string | null
}

/**
 * One part of sales history as a ruled index line: the title is the link (its arrow slides on
 * hover), what it is for beside it, and its live figure in the serif on the right.
 */
function AreaLine(props: { readonly area: Area }) {
  return (
    <li className='grid items-baseline gap-x-8 gap-y-1 border-b py-5 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_auto]'>
      <Link
        to={props.area.to}
        className='group ink-hover inline-flex w-fit items-baseline gap-2 rounded-sm font-serif text-2xl leading-tight tracking-[-0.012em] outline-hidden focus-visible:ring-2 focus-visible:ring-ring'
      >
        <span className='ink-link'>{props.area.title}</span>
        <ArrowRight
          aria-hidden='true'
          className='size-4 shrink-0 self-center text-muted-foreground transition-transform duration-(--dur-hover) ease-(--ease-out) group-hover:translate-x-1 group-hover:text-foreground group-focus-visible:translate-x-1'
        />
      </Link>
      <span className='text-sm text-muted-foreground'>{props.area.text}</span>
      {props.area.figure === undefined ? null : (
        <span className='font-serif text-lg whitespace-nowrap tabular-nums sm:text-end'>
          {props.area.figure ?? <Skeleton className='inline-block h-[0.8em] w-20 align-baseline' />}
        </span>
      )}
    </li>
  )
}

/** A count from a single first page: the number, with + when the page was full; null while it loads. */
function counted(page: FirstPage<unknown>): string | null {
  if (page.isPending) {
    return null
  }
  return page.isError ? '-' : `${page.items.length.toLocaleString()}${page.more ? '+' : ''}`
}

function plural(count: string, one: string, many: string): string {
  return `${count} ${count === '1' ? one : many}`
}

const DOT = 'size-1.5 shrink-0 -translate-y-px rounded-full'
const LINK =
  'rounded-sm font-medium text-foreground ink-link outline-hidden focus-visible:ring-2 focus-visible:ring-ring'

/** The start of sales history: whether the rights are confirmed, and where to go next with live figures. */
export function SalesOverview() {
  useDocumentTitle('Sales history')
  const rights = useRights(true)
  const role = useRole()
  // Each figure is one first page (the import a page of one), only for roles that manage sales history.
  const figures = role !== null && can.manageSalesHistory(role)
  const deals = counted(useDealsFirstPage(figures))
  const won = counted(useWonDealsFirstPage(figures))
  const calls = counted(useCallsFirstPage(figures))
  const latestImport = useLatestImport(figures)
  const lastImport = latestImport.items[0]
  const areas: Area[] = [
    {
      to: '/sales-history/deals',
      title: 'Deals',
      text: 'Find a Deal, set or correct its Outcome.',
      figure:
        deals === null || won === null ? null : `${plural(deals, 'Deal', 'Deals')}, ${won} won`,
    },
    {
      to: '/sales-history/imports',
      title: 'Imports',
      text: 'Upload a CSV of Deals and read its report.',
      figure: latestImport.isPending
        ? null
        : latestImport.isError
          ? '-'
          : lastImport === undefined
            ? 'No import yet'
            : `last import ${formatDay(lastImport.createdAt)}`,
    },
    {
      to: '/sales-history/calls',
      title: 'Calls',
      text: 'Upload Transcripts and Recordings for a Deal.',
      figure: calls === null ? null : plural(calls, 'Call', 'Calls'),
    },
    {
      to: '/sales-history/rights',
      title: 'Rights confirmation',
      text: 'Confirm your Organization may share its Calls.',
    },
  ]
  if (role !== null && can.searchWonDeals(role)) {
    areas.push({
      to: '/sales-history/search',
      title: 'Search won Deals',
      text: 'See what your best Reps said at the same moment.',
    })
  }
  if (!figures) {
    for (const [index, area] of areas.entries()) {
      areas[index] = { to: area.to, title: area.title, text: area.text }
    }
  }
  return (
    <>
      <PageHeader
        eyebrow='Sales'
        title='Sales history'
        description='Past Deals and their Calls teach your Playbook what winning looks like. Only Calls from won Deals are used in search.'
      />
      <div className='flex flex-col gap-10'>
        {rights.isPending ? (
          <div>
            <p role='status' className='sr-only'>
              Loading...
            </p>
            <Skeleton className='h-5 w-2/3' />
          </div>
        ) : rights.isError ? (
          <Banner kind='error' className='m-0'>
            {presentSales(rights.error, 'rights').message}
          </Banner>
        ) : rights.data.confirmed ? (
          <div className='flex items-baseline gap-3 motion-safe:animate-fade'>
            <span aria-hidden='true' className={`${DOT} bg-success`} />
            <p className='m-0 text-sm'>
              Rights confirmed: wording version {rights.data.currentWordingVersion}. You can upload
              Transcripts.
            </p>
          </div>
        ) : (
          <div className='flex items-baseline gap-3 motion-safe:animate-fade'>
            <span aria-hidden='true' className={`${DOT} bg-warning`} />
            <p className='m-0 text-sm'>
              The rights confirmation has not been confirmed for the current wording.{' '}
              <Link to='/sales-history/rights' className={LINK}>
                Confirm it
              </Link>{' '}
              before uploading Transcripts.
            </p>
          </div>
        )}
        <ul aria-label='Sales history' className='m-0 list-none border-t border-rule-strong p-0'>
          {areas.map((area) => (
            <AreaLine key={area.title} area={area} />
          ))}
        </ul>
      </div>
    </>
  )
}
