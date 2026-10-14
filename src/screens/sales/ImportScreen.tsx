import { getRouteApi, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import type { DealImportRow } from 'tula-closeline-contract'
import { presentSales } from '~/api/sales-messages'
import { PageHeader } from '~/components/app/page-header'
import { StatusBadge } from '~/components/app/status-badge'
import { csvLine } from '~/data/csv-export'
import { useDealImport, useImportRows } from '~/data/queries'
import {
  IMPORT_PENDING_STATES,
  importFailureWords,
  importStateLabel,
  rowReasonWords,
  SALES_POLL_SCHEDULE_MS,
} from '~/data/sales-history'
import { useDownloadUrl } from '~/data/use-download-url'
import { usePendingPoll } from '~/data/use-pending-poll'
import { Banner } from '~/ui/Banner'
import { Paged } from '~/ui/Paged'
import { ScrollRegion } from '~/ui/ScrollRegion'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { When } from '~/ui/When'

const route = getRouteApi('/_app/sales-history/imports/$importId')

/** One Deal import: its state and counts, and once it is done a report row by row. */
export function ImportScreen() {
  useDocumentTitle('Deal import')
  const { importId } = route.useParams()
  const item = useDealImport(importId)
  const pending = item.data !== undefined && IMPORT_PENDING_STATES.includes(item.data.state)
  const poll = usePendingPoll(pending ? [importId] : [], item.refetch, SALES_POLL_SCHEDULE_MS)
  return (
    <>
      <PageHeader
        title='Deal import'
        actions={
          <Link to='/sales-history/imports' className='button button-quiet'>
            Back to imports
          </Link>
        }
      />
      {item.isPending ? (
        <p role='status' className='hint'>
          Loading...
        </p>
      ) : item.isError ? (
        <>
          <Banner kind='error'>{presentSales(item.error, 'import-read').message}</Banner>
          <p>
            <button type='button' className='button button-quiet' onClick={() => item.refetch()}>
              Try again
            </button>
          </p>
        </>
      ) : (
        <>
          <dl>
            <dt>Status</dt>
            <dd>{importStateLabel(item.data.state)}</dd>
            <dt>Uploaded</dt>
            <dd>
              <When iso={item.data.createdAt} />
            </dd>
            {item.data.state === 'completed' ? (
              <>
                <dt>Rows</dt>
                <dd>{item.data.rowCount}</dd>
                <dt>Applied</dt>
                <dd>{item.data.appliedCount}</dd>
                <dt>Rejected</dt>
                <dd>{item.data.rejectedCount}</dd>
              </>
            ) : null}
          </dl>
          {pending ? (
            <p className='hint'>
              This page checks again every few seconds until the import is done.
            </p>
          ) : null}
          {poll.paused ? (
            <Banner kind='info'>
              We stopped checking for updates.{' '}
              <button type='button' className='button button-quiet' onClick={poll.resume}>
                Check again
              </button>
            </Banner>
          ) : null}
          {item.data.state === 'failed' ? (
            <Banner kind='error'>
              {importFailureWords(item.data.failureReason ?? 'processing_failed')}
            </Banner>
          ) : null}
          {item.data.state === 'completed' ? <Report importId={importId} /> : null}
        </>
      )}
    </>
  )
}

function exportText(rows: readonly DealImportRow[]): string {
  return [
    csvLine(['row', 'deal_id', 'reason']),
    ...rows.map((row) => csvLine([String(row.rowNumber), row.dealId ?? '', row.reason ?? ''])),
  ].join('')
}

function Report(props: { readonly importId: string }) {
  const [rejectedOnly, setRejectedOnly] = useState(true)
  const rows = useImportRows(props.importId, rejectedOnly, true)
  const text = useMemo(() => exportText(rows.items), [rows.items])
  const url = useDownloadUrl(text)
  return (
    <section aria-labelledby='report-heading'>
      <h2 id='report-heading'>Report</h2>
      <div className='field'>
        <label htmlFor='report-rejected'>
          <input
            id='report-rejected'
            type='checkbox'
            checked={rejectedOnly}
            onChange={(event) => setRejectedOnly(event.target.checked)}
          />{' '}
          Show only the rejected rows
        </label>
      </div>
      <Paged
        noun='rows'
        emptyText={rejectedOnly ? 'No row was rejected.' : 'The report has no rows.'}
        state={rows.state}
      >
        {rejectedOnly && url !== null ? (
          <p>
            <a href={url} download='rejected-rows.csv'>
              Download these rows (CSV)
            </a>
            {rows.state.hasNextPage ? (
              <span className='hint'> Only the rows loaded so far are included.</span>
            ) : null}
          </p>
        ) : null}
        <ScrollRegion label='Report rows'>
          <table>
            <thead>
              <tr>
                <th scope='col'>Row</th>
                <th scope='col'>Deal id</th>
                <th scope='col'>Result</th>
                <th scope='col'>Why</th>
              </tr>
            </thead>
            <tbody>
              {rows.items.map((row) => (
                <tr key={row.rowNumber}>
                  <td>{row.rowNumber}</td>
                  <td>{row.dealId === null ? '-' : <Untrusted value={row.dealId} />}</td>
                  <td>
                    <StatusBadge state={row.result === 'applied' ? 'completed' : 'failed'}>
                      {row.result === 'applied' ? 'Applied' : 'Rejected'}
                    </StatusBadge>
                  </td>
                  <td>{row.reason === null ? '' : rowReasonWords(row.reason)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </Paged>
    </section>
  )
}
