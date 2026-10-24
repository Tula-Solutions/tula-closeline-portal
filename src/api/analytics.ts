import {
  type AgentKind,
  type AnalyticsGroupBy,
  type AnalyticsMetric,
  type GetSeriesResponse,
  getSeriesResponseSchema,
  type InboxChannel,
  listTableResponseSchema,
  MAX_ANALYTICS_CSV_PAGE_SIZE,
  type TableRow,
} from 'tula-closeline-contract'
import type { PageRequest } from '~/api/core'
import type { HttpClient } from '~/api/http'

/** The range and dimension filters of every analytics call; `from` and `to` are inclusive calendar dates (YYYY-MM-DD). */
export type AnalyticsFilter = {
  readonly from: string
  readonly to: string
  readonly channel?: InboxChannel
  readonly agentKind?: AgentKind
  readonly campaignId?: string
  readonly repMembershipId?: string
}

/** One page of comparison rows, one row per group. */
export type TablePage = { readonly items: readonly TableRow[]; readonly nextCursor: string | null }

/** One page of the table CSV: its text and where the next page starts (null on the last). */
export type TableCsvPage = { readonly csv: string; readonly nextCursor: string | null }

/** The most groups one table page holds (core's page maximum). */
export const TABLE_PAGE_SIZE = 100

/** The core routes the portal uses for the analytics dashboards (every role reads, within its own scope). */
export type AnalyticsApi = {
  /** One metric over the range, by day, ungrouped or one line per group. */
  getSeries(
    filter: AnalyticsFilter,
    metric: AnalyticsMetric,
    groupBy: AnalyticsGroupBy | undefined,
    signal?: AbortSignal
  ): Promise<GetSeriesResponse>
  /** One page of the comparison table grouped by `groupBy`. */
  listTable(
    filter: AnalyticsFilter,
    groupBy: AnalyticsGroupBy,
    page: PageRequest
  ): Promise<TablePage>
  /** One page of the table as CSV (header row on every page). */
  downloadTableCsv(
    filter: AnalyticsFilter,
    groupBy: AnalyticsGroupBy,
    cursor: string | undefined
  ): Promise<TableCsvPage>
}

/** The filter as query parameters, leaving out what is empty. */
function filterQuery(filter: AnalyticsFilter): Record<string, string> {
  const query: Record<string, string> = {}
  for (const [name, value] of Object.entries(filter)) {
    if (typeof value === 'string' && value !== '') {
      query[name] = value
    }
  }
  return query
}

/** Builds the analytics routes over an HTTP client for same-origin paths, which sends the access token. */
export function createAnalyticsApi(http: HttpClient): AnalyticsApi {
  return {
    getSeries: (filter, metric, groupBy, signal) =>
      http.request({
        path: '/v1/analytics/series',
        query: { ...filterQuery(filter), metric, groupBy },
        auth: true,
        ...(signal ? { signal } : {}),
        parse: (json) => getSeriesResponseSchema.parse(json),
      }),
    listTable: (filter, groupBy, page) =>
      http.request({
        path: '/v1/analytics/table',
        query: {
          ...filterQuery(filter),
          groupBy,
          cursor: page.cursor,
          limit: page.limit ?? TABLE_PAGE_SIZE,
        },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => listTableResponseSchema.parse(json),
      }),
    downloadTableCsv: (filter, groupBy, cursor) =>
      http.request({
        path: '/v1/analytics/table.csv',
        query: {
          ...filterQuery(filter),
          groupBy,
          cursor,
          limit: MAX_ANALYTICS_CSV_PAGE_SIZE,
        },
        auth: true,
        text: true,
        parse: (text, _status, headers) => {
          if (typeof text !== 'string') {
            throw new Error('not text')
          }
          const next = headers.get('x-next-cursor')
          return { csv: text, nextCursor: next === null || next === '' ? null : next }
        },
      }),
  }
}
