import { Link, type LinkProps } from '@tanstack/react-router'
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
  readonly title: string
  readonly text: string
}

/** One part of sales history as a ruled index line: the title is the link, with what it is for beside it. */
function AreaLine(props: { readonly area: Area }) {
  return (
    <li className='grid items-baseline gap-x-8 gap-y-1 border-b py-5 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]'>
      <Link
        to={props.area.to}
        className='w-fit rounded-sm font-serif text-2xl leading-tight tracking-[-0.012em] underline decoration-border-strong decoration-1 underline-offset-4 outline-hidden hover:decoration-current focus-visible:ring-2 focus-visible:ring-ring'
      >
        {props.area.title}
      </Link>
      <span className='text-sm text-muted-foreground'>{props.area.text}</span>
    </li>
  )
}

const DOT = 'size-1.5 shrink-0 -translate-y-px rounded-full'
const LINK =
  'rounded-sm font-medium text-foreground underline decoration-border-strong underline-offset-4 outline-hidden hover:decoration-current focus-visible:ring-2 focus-visible:ring-ring'

/** The start of sales history: whether the rights are confirmed, and where to go next. */
export function SalesOverview() {
  useDocumentTitle('Sales history')
  const rights = useRights(true)
  const role = useRole()
  const areas: Area[] = [
    {
      to: '/sales-history/deals',
      title: 'Deals',
      text: 'Find a Deal, set or correct its Outcome.',
    },
    {
      to: '/sales-history/imports',
      title: 'Imports',
      text: 'Upload a CSV of Deals and read its report.',
    },
    {
      to: '/sales-history/calls',
      title: 'Calls',
      text: 'Upload Transcripts and Recordings for a Deal.',
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
