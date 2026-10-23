import { getRouteApi, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import type { ProspectImport, ProspectImportRowResult } from 'tula-closeline-contract'
import { presentProspect } from '~/api/prospect-messages'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { StatusBadge } from '~/components/app/status-badge'
import {
  PROSPECT_IMPORT_PENDING_STATES,
  prospectImportFailureWords,
  prospectImportStateLabel,
  ROW_RESULT_LABEL,
  rowReasonWords,
  rowResultLabel,
} from '~/data/prospect-imports'
import { useProspectImport, useProspectImportRows } from '~/data/queries'
import { SALES_POLL_SCHEDULE_MS } from '~/data/sales-history'
import { usePendingPoll } from '~/data/use-pending-poll'
import { Banner } from '~/ui/Banner'
import { Paged } from '~/ui/Paged'
import { ScrollRegion } from '~/ui/ScrollRegion'
import { SelectField } from '~/ui/SelectField'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { When } from '~/ui/When'
import { ImportSteps } from './ImportSteps'

const route = getRouteApi('/_app/prospects/imports/$importId')

const RESULT_ROW_STATE = {
  created: 'completed',
  updated: 'completed',
  skipped: 'open',
  rejected: 'failed',
} as const

/** Steps 2 and 3 of a Prospect import: its live status while it runs, then the report row by row. */
export function ProspectImportScreen() {
  useDocumentTitle('Prospect import')
  const { importId } = route.useParams()
  const item = useProspectImport(importId)
  const pending =
    item.data !== undefined && PROSPECT_IMPORT_PENDING_STATES.includes(item.data.state)
  const poll = usePendingPoll(pending ? [importId] : [], item.refetch, SALES_POLL_SCHEDULE_MS)
  return (
    <>
      <PageHeader
        eyebrow='Sales'
        title='Prospect import'
        actions={
          <Link to='/prospects/imports' className='button button-quiet'>
            <ArrowLeft aria-hidden='true' className='size-4' />
            All imports
          </Link>
        }
      />
      <ImportSteps current={item.data === undefined || pending ? 1 : 2} />
      {item.isPending ? (
        <p role='status' className='hint'>
          Loading...
        </p>
      ) : item.isError ? (
        <>
          <Banner kind='error'>{presentProspect(item.error).message}</Banner>
          <p>
            <button type='button' className='button button-quiet' onClick={() => item.refetch()}>
              Try again
            </button>
          </p>
        </>
      ) : (
        <>
          <Status item={item.data} />
          {pending ? (
            <p className='hint'>
              This page checks again every few seconds until the import is done. You can leave this
              page and come back: the import keeps running.
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
            <Banner kind='error'>{prospectImportFailureWords(item.data.failureReason)}</Banner>
          ) : null}
          {item.data.state === 'completed' ? <Report item={item.data} /> : null}
        </>
      )}
    </>
  )
}

function Status(props: { readonly item: ProspectImport }) {
  const { item } = props
  return (
    <dl>
      <dt>Status</dt>
      <dd>{prospectImportStateLabel(item.state)}</dd>
      <dt>Uploaded</dt>
      <dd>
        <When iso={item.createdAt} />
      </dd>
    </dl>
  )
}

const FILTER_OPTIONS = [
  { value: 'all', text: 'All rows' },
  ...(Object.keys(ROW_RESULT_LABEL) as ProspectImportRowResult[]).map((value) => ({
    value,
    text: ROW_RESULT_LABEL[value],
  })),
]

function Report(props: { readonly item: ProspectImport }) {
  const { item } = props
  const [result, setResult] = useState<'all' | ProspectImportRowResult>('all')
  const rows = useProspectImportRows(item.id, result, true)
  const counts: readonly [string, number | null][] = [
    ['rows', item.rowCount],
    ['created', item.createdCount],
    ['updated', item.updatedCount],
    ['skipped', item.skippedCount],
    ['rejected', item.rejectedCount],
  ]
  return (
    <section aria-labelledby='report-heading'>
      <h2 id='report-heading'>Report</h2>
      <ul aria-label='Result counts' className='m-0 mb-4 flex list-none flex-wrap gap-x-6 p-0'>
        {counts.map(([word, count]) => (
          <li key={word}>
            <strong>{count ?? 0}</strong> {word}
          </li>
        ))}
      </ul>
      <DownloadReport importId={item.id} />
      <SelectField
        inline
        label='Show'
        value={result}
        options={FILTER_OPTIONS}
        onChange={(event) => {
          const next = event.target.value
          setResult(
            next === 'all' || Object.hasOwn(ROW_RESULT_LABEL, next)
              ? (next as 'all' | ProspectImportRowResult)
              : 'all'
          )
        }}
      />
      <Paged noun='rows' emptyText='No row has this result.' state={rows.state}>
        <ScrollRegion label='Report rows'>
          <table>
            <thead>
              <tr>
                <th scope='col'>Row</th>
                <th scope='col'>Result</th>
                <th scope='col'>Why</th>
                <th scope='col'>Prospect</th>
              </tr>
            </thead>
            <tbody>
              {rows.items.map((row) => (
                <tr key={row.rowNumber}>
                  <td>{row.rowNumber}</td>
                  <td>
                    <StatusBadge
                      state={
                        Object.hasOwn(RESULT_ROW_STATE, row.result)
                          ? RESULT_ROW_STATE[row.result]
                          : 'open'
                      }
                    >
                      {rowResultLabel(row.result)}
                    </StatusBadge>
                  </td>
                  <td>{rowReasonWords(row.reason)}</td>
                  <td>
                    {row.prospectId === null ? (
                      '-'
                    ) : (
                      <Link to='/prospects/$prospectId' params={{ prospectId: row.prospectId }}>
                        Open Prospect
                        <span className='sr-only'> of row {row.rowNumber}</span>
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </Paged>
    </section>
  )
}

/** Fetches core's own report CSV on click and hands it to the browser as a file; a failure is said and the button works again. */
function DownloadReport(props: { readonly importId: string }) {
  const app = useApp()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const download = async () => {
    if (busy) {
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      const text = await app.core.getProspectImportReport(props.importId)
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'prospect-import-report.csv'
      document.body.append(link)
      link.click()
      link.remove()
      // Some browsers start the save only after click() returns, so the URL outlives the click.
      setTimeout(() => URL.revokeObjectURL(url), 1_000)
    } catch (error) {
      setProblem(presentProspect(error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      {problem === null ? null : <Banner kind='error'>{problem}</Banner>}
      <p>
        <button
          type='button'
          className='button button-quiet'
          aria-disabled={busy}
          onClick={() => void download()}
        >
          Download the report (CSV)
        </button>
      </p>
    </>
  )
}
