import { Link, type LinkProps } from '@tanstack/react-router'
import {
  ArrowUpRight,
  CircleCheck,
  FileSpreadsheet,
  Handshake,
  type LucideIcon,
  Phone,
  Search,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react'
import { presentSales } from '~/api/sales-messages'
import { PageHeader } from '~/components/app/page-header'
import { Skeleton } from '~/components/ui/skeleton'
import { can } from '~/data/permissions'
import { useRights } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { Banner } from '~/ui/Banner'
import { useDocumentTitle } from '~/ui/useDocumentTitle'

type Area = {
  readonly to: LinkProps['to']
  readonly icon: LucideIcon
  readonly title: string
  readonly text: string
}

/** One part of sales history as a card; the whole card is the link. */
function AreaCard(props: { readonly area: Area }) {
  const Icon = props.area.icon
  return (
    <li className='group relative flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-elev-1 transition-[box-shadow,border-color,transform] duration-200 ease-snappy hover:border-border-strong hover:shadow-elev-2 motion-safe:hover:-translate-y-px'>
      <div className='flex items-center justify-between'>
        <span
          aria-hidden='true'
          className='flex size-9 items-center justify-center rounded-lg bg-muted text-foreground'
        >
          <Icon className='size-[18px]' />
        </span>
        <ArrowUpRight
          aria-hidden='true'
          className='size-4 text-muted-foreground transition-transform duration-200 ease-snappy group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary'
        />
      </div>
      <Link
        to={props.area.to}
        className='flex flex-col gap-1 outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring'
      >
        <span className='text-sm font-semibold text-foreground'>{props.area.title}</span>
        <span className='text-[0.8125rem] text-muted-foreground'>{props.area.text}</span>
      </Link>
    </li>
  )
}

/** The start of sales history: whether the rights are confirmed, and where to go next. */
export function SalesOverview() {
  useDocumentTitle('Sales history')
  const rights = useRights(true)
  const role = useRole()
  const areas: Area[] = [
    {
      to: '/sales-history/deals',
      icon: Handshake,
      title: 'Deals',
      text: 'Find a Deal, set or correct its Outcome.',
    },
    {
      to: '/sales-history/imports',
      icon: FileSpreadsheet,
      title: 'Imports',
      text: 'Upload a CSV of Deals and read its report.',
    },
    {
      to: '/sales-history/calls',
      icon: Phone,
      title: 'Calls',
      text: 'Upload Transcripts and Recordings for a Deal.',
    },
    {
      to: '/sales-history/rights',
      icon: ShieldCheck,
      title: 'Rights confirmation',
      text: 'Confirm your Organization may share its Calls.',
    },
  ]
  if (role !== null && can.searchWonDeals(role)) {
    areas.push({
      to: '/sales-history/search',
      icon: Search,
      title: 'Search won Deals',
      text: 'See what your best Reps said at the same moment.',
    })
  }
  return (
    <>
      <PageHeader
        icon={TrendingUp}
        title='Sales history'
        description='Past Deals and their Calls teach your Playbook what winning looks like. Only Calls from won Deals are used in search.'
      />
      <div className='flex flex-col gap-6'>
        {rights.isPending ? (
          <div>
            <p role='status' className='sr-only'>
              Loading...
            </p>
            <Skeleton className='h-14 w-full rounded-xl' />
          </div>
        ) : rights.isError ? (
          <Banner kind='error' className='m-0'>
            {presentSales(rights.error, 'rights').message}
          </Banner>
        ) : rights.data.confirmed ? (
          <div className='flex items-center gap-3 rounded-xl border border-success/25 bg-success-soft px-4 py-3 text-success motion-safe:animate-fade'>
            <CircleCheck aria-hidden='true' className='size-5 shrink-0' />
            <p className='m-0 text-sm font-medium'>
              Rights confirmed: wording version {rights.data.currentWordingVersion}. You can upload
              Transcripts.
            </p>
          </div>
        ) : (
          <div className='flex items-center gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-warning motion-safe:animate-fade'>
            <TriangleAlert aria-hidden='true' className='size-5 shrink-0' />
            <p className='m-0 text-sm font-medium'>
              The rights confirmation has not been confirmed for the current wording.{' '}
              <Link to='/sales-history/rights' className='font-semibold text-warning underline'>
                Confirm it
              </Link>{' '}
              before uploading Transcripts.
            </p>
          </div>
        )}
        <ul
          aria-label='Sales history'
          className='m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3'
        >
          {areas.map((area) => (
            <AreaCard key={area.title} area={area} />
          ))}
        </ul>
      </div>
    </>
  )
}
