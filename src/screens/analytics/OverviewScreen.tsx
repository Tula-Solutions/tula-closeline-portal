import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { ANALYTICS_METRICS, type AnalyticsMetric, type Role } from 'tula-closeline-contract'
import type { AnalyticsFilter } from '~/api/analytics'
import { presentAnalytics } from '~/api/analytics-messages'
import { PageHeader } from '~/components/app/page-header'
import { Skeleton } from '~/components/ui/skeleton'
import { can } from '~/data/permissions'
import { useAnalyticsSeries } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { FilterBar } from '~/screens/analytics/FilterBar'
import { formatCount, METRIC_WORDS } from '~/screens/analytics/format'
import { LineChart } from '~/screens/analytics/LineChart'
import { dayString, eachDay, rangeProblem } from '~/screens/analytics/range'
import {
  type AnalyticsSearch,
  analyticsFilter,
  mergeSearch,
  readAnalyticsSearch,
} from '~/screens/analytics/search'
import { Banner } from '~/ui/Banner'
import { ScrollRegion } from '~/ui/ScrollRegion'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { DateOnly } from '~/ui/When'

const route = getRouteApi('/_app/analytics/')

/** The Conversations behind a count that the inbox can be narrowed to today (only replies have one). */
const DRILL_LABEL: Partial<Record<AnalyticsMetric, 'positive'>> = { positive_replies: 'positive' }
const DRILL_METRICS: readonly AnalyticsMetric[] = ['replies', 'positive_replies']

function MetricRow(props: {
  readonly metric: AnalyticsMetric
  readonly filter: AnalyticsFilter
  readonly enabled: boolean
}) {
  const { metric, filter } = props
  const words = METRIC_WORDS[metric]
  const series = useAnalyticsSeries(filter, metric, undefined, props.enabled)
  const [asTable, setAsTable] = useState(false)
  const tableId = useId()
  const points = (series.data?.series[0]?.points ?? []).flatMap((point) =>
    point.kind === 'count' ? [{ day: point.day, value: point.value }] : []
  )
  const total = points.reduce((sum, point) => sum + point.value, 0)
  const drill = DRILL_METRICS.includes(metric)
  return (
    <section aria-labelledby={`${tableId}-h`} className='analytics-metric'>
      <div className='analytics-metric-head'>
        <h2 id={`${tableId}-h`} className='m-0'>
          {words.name}
        </h2>
        {series.data ? (
          <p className='m-0 font-mono text-sm tabular-nums'>
            <span className='sr-only'>Total: </span>
            {formatCount(total)}
          </p>
        ) : null}
      </div>
      {series.isPending ? (
        <div>
          <p role='status' className='sr-only'>
            Loading {words.name.toLowerCase()}...
          </p>
          <Skeleton aria-hidden='true' className='h-36 w-full max-w-2xl' />
        </div>
      ) : series.isError ? (
        <div>
          <Banner kind='error'>{presentAnalytics(series.error).message}</Banner>
          <button
            type='button'
            className='button button-quiet'
            onClick={() => void series.refetch()}
          >
            Try again
          </button>
        </div>
      ) : total === 0 ? (
        <p className='m-0 text-sm text-muted-foreground'>
          No {words.unit} in this range. Widen the dates or clear a filter to look further back.
        </p>
      ) : (
        <>
          <LineChart
            name={words.name}
            unit={words.unit}
            from={filter.from}
            to={filter.to}
            points={points}
          />
          <div className='analytics-metric-actions'>
            <button
              type='button'
              className='button button-quiet'
              aria-expanded={asTable}
              aria-controls={tableId}
              onClick={() => setAsTable((now) => !now)}
            >
              {asTable ? 'Hide the table' : 'View as table'}
            </button>
            {drill ? (
              <Link
                to='/inbox'
                search={{
                  ...(DRILL_LABEL[metric] ? { label: DRILL_LABEL[metric] } : {}),
                  ...(filter.channel ? { channel: filter.channel } : {}),
                }}
                className='link'
              >
                See the Conversations
              </Link>
            ) : null}
          </div>
          {asTable ? (
            <div id={tableId}>
              <ScrollRegion label={`${words.name} by day`}>
                <table>
                  <thead>
                    <tr>
                      <th scope='col'>Day</th>
                      <th scope='col' className='num'>
                        {words.name}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {eachDay(filter.from, filter.to).map((day) => (
                      <tr key={day}>
                        <th scope='row'>
                          <DateOnly value={day} />
                        </th>
                        <td className='num'>
                          {formatCount(points.find((point) => point.day === day)?.value ?? 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollRegion>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

function scopeNote(role: Role, search: AnalyticsSearch): string | null {
  if (role === 'rep') {
    return 'These are your numbers. Today only meetings are credited to a Rep, so the other rows stay empty until the Conversations behind them are assigned to you.'
  }
  if (role === 'manager') {
    return 'These are the numbers of the Reps on your Teams. Today only meetings are credited to a Rep, so the other rows stay empty.'
  }
  if (search.repMembershipId) {
    return 'Filtered to one Rep. Today only meetings are credited to a Rep, so the other rows stay empty.'
  }
  return null
}

/** The overview: sends, replies, positive replies, meetings and Outcomes by day, for the range and filters in the address, within the role's own scope. */
export function OverviewScreen() {
  useDocumentTitle('Analytics')
  const role = useRole()
  const search = readAnalyticsSearch(route.useSearch())
  const navigate = useNavigate({ from: '/analytics/' })
  const [today] = useState(() => dayString(new Date()))
  if (role === null) {
    return null
  }
  if (!can.viewAnalytics(role)) {
    return (
      <PageHeader
        eyebrow='Analytics'
        title='Overview'
        description='Your role cannot open the numbers.'
      />
    )
  }
  const filter = analyticsFilter(role, search, today)
  const problem = rangeProblem(filter.from, filter.to)
  const note = scopeNote(role, search)
  return (
    <>
      <PageHeader
        eyebrow='Analytics'
        title='Overview'
        description='What your Agents and Reps sent, what came back and what it led to, by day. Each count links to the Conversations behind it where the inbox can show them.'
      />
      <FilterBar
        role={role}
        from={filter.from}
        to={filter.to}
        today={today}
        search={{ ...search, from: filter.from, to: filter.to }}
        dimensions={{ channelAndAgent: true, rep: true }}
        onChange={(next) =>
          void navigate({
            search: (now) => mergeSearch(readAnalyticsSearch(now), next),
            replace: true,
          })
        }
      />
      {problem === null ? null : <Banner kind='error'>{problem}</Banner>}
      {note === null ? null : <Banner kind='info'>{note}</Banner>}
      <p className='analytics-drill-note m-0 mb-6 text-sm text-muted-foreground'>
        The inbox can be narrowed by Channel and label only, not yet by Campaign, Rep or day, so a
        link carries just what it can.
      </p>
      <div className='analytics-metrics'>
        {ANALYTICS_METRICS.map((metric) => (
          <MetricRow key={metric} metric={metric} filter={filter} enabled={problem === null} />
        ))}
      </div>
    </>
  )
}
