import { useState } from 'react'
import type { AnalyticsGroupBy } from 'tula-closeline-contract'
import type { AnalyticsFilter } from '~/api/analytics'
import { presentAnalytics } from '~/api/analytics-messages'
import { useApp } from '~/app-context'
import { Banner } from '~/ui/Banner'

const MAX_CSV_PAGES = 20
const CSV_ROWS_PER_PAGE = 1000

/**
 * Downloads the comparison table as a CSV file for the range and filters on screen, walking core's
 * pages and keeping the header row once. The file stops at 20 pages and says so.
 */
export function DownloadCsv(props: {
  readonly filter: AnalyticsFilter
  readonly groupBy: AnalyticsGroupBy
}) {
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
        const got = await app.analytics.downloadTableCsv(props.filter, props.groupBy, cursor)
        // Every page repeats the header row; the file keeps the first.
        const firstBreak = got.csv.indexOf('\n')
        const later = firstBreak === -1 ? '' : got.csv.slice(firstBreak + 1)
        const body = pages === 0 ? got.csv : later
        text += text !== '' && !text.endsWith('\n') ? `\n${body}` : body
        cursor = got.nextCursor ?? undefined
        more = cursor !== undefined
      }
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `${props.groupBy === 'campaign' ? 'campaigns' : 'reps'}-${props.filter.from}-to-${props.filter.to}.csv`
      document.body.append(link)
      link.click()
      link.remove()
      // Some browsers start the save only after click() returns, so the URL outlives the click.
      setTimeout(() => URL.revokeObjectURL(url), 1_000)
      if (more) {
        setMessage({
          kind: 'info',
          text: `The file holds the first ${MAX_CSV_PAGES * CSV_ROWS_PER_PAGE} rows. Narrow the dates or filters to get the rest.`,
        })
      }
    } catch (error) {
      setMessage({ kind: 'error', text: presentAnalytics(error).message })
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
