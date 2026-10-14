import { Link } from '@tanstack/react-router'
import { presentSales } from '~/api/sales-messages'
import { PageHeader } from '~/components/app/page-header'
import { useRights } from '~/data/queries'
import { Banner } from '~/ui/Banner'
import { useDocumentTitle } from '~/ui/useDocumentTitle'

/** The start of sales history: whether the rights are confirmed, and where to go next. */
export function SalesOverview() {
  useDocumentTitle('Sales history')
  const rights = useRights(true)
  return (
    <>
      <PageHeader
        title='Sales history'
        description='Past Deals and their Calls teach your Playbook what winning looks like. Only Calls from won Deals are used in search.'
      />
      {rights.isPending ? (
        <p role='status' className='hint'>
          Loading...
        </p>
      ) : rights.isError ? (
        <Banner kind='error'>{presentSales(rights.error, 'rights').message}</Banner>
      ) : rights.data.confirmed ? (
        <p>
          Rights confirmed: wording version {rights.data.currentWordingVersion}. You can upload
          Transcripts.
        </p>
      ) : (
        <p>
          The rights confirmation has not been confirmed for the current wording.{' '}
          <Link to='/sales-history/rights'>Confirm it</Link> before uploading Transcripts.
        </p>
      )}
      <ul>
        <li>
          <Link to='/sales-history/deals'>Deals</Link>: find a Deal, set or correct its Outcome.
        </li>
        <li>
          <Link to='/sales-history/imports'>Imports</Link>: upload a CSV of Deals and read its
          report.
        </li>
      </ul>
    </>
  )
}
