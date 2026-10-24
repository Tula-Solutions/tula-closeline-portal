import {
  type AuditActorKind,
  type AuditEvent,
  listAuditEventsResponseSchema,
  verifyAuditResponseSchema,
} from 'tula-closeline-contract'
import { PAGE_SIZE, type PageRequest } from '~/api/core'
import type { HttpClient } from '~/api/http'

/** One page of audit events, newest first. */
export type AuditPage = {
  readonly items: readonly AuditEvent[]
  readonly nextCursor: string | null
}

/** The filters of the audit log; an absent field does not narrow. `from` and `to` are ISO date-times. */
export type AuditFilter = {
  readonly actorKind?: AuditActorKind
  readonly actorId?: string
  readonly action?: string
  readonly subjectType?: string
  readonly subjectId?: string
  readonly prospectId?: string
  readonly from?: string
  readonly to?: string
}

/** The answer of one verification pass over the hash chain. */
export type AuditVerification = ReturnType<typeof verifyAuditResponseSchema.parse>

/** One page of the audit CSV: its text and where the next page starts (null on the last). */
export type AuditCsvPage = { readonly csv: string; readonly nextCursor: string | null }

/** The core routes the portal uses for the audit log (Owner, Admin and, to read, Manager). */
export type AuditApi = {
  /** One page of events matching the filter, newest first. */
  listAuditEvents(filter: AuditFilter, page: PageRequest): Promise<AuditPage>
  /** One page of the CSV export of the events matching the filter, oldest first. Each call is itself audited. */
  downloadAuditCsv(filter: AuditFilter, cursor: string | undefined): Promise<AuditCsvPage>
  /** Checks the chain from a sequence (the start of the log when none) for at most `count` events. */
  verifyAuditLog(fromSequence: number | undefined, count: number): Promise<AuditVerification>
}

/** The filter as query parameters, leaving out what is empty. */
function filterQuery(filter: AuditFilter): Record<string, string> {
  const query: Record<string, string> = {}
  for (const [name, value] of Object.entries(filter)) {
    if (typeof value === 'string' && value !== '') {
      query[name] = value
    }
  }
  return query
}

/** The most events one CSV page holds (core's limit). */
export const CSV_PAGE_SIZE = 1000

/** Builds the audit routes over an HTTP client for same-origin paths, which sends the access token. */
export function createAuditApi(http: HttpClient): AuditApi {
  return {
    listAuditEvents: (filter, page) =>
      http.request({
        path: '/v1/audit-events',
        query: { ...filterQuery(filter), cursor: page.cursor, limit: page.limit ?? PAGE_SIZE },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => listAuditEventsResponseSchema.parse(json),
      }),
    downloadAuditCsv: (filter, cursor) =>
      http.request({
        path: '/v1/audit-csv',
        query: { ...filterQuery(filter), cursor, limit: CSV_PAGE_SIZE },
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
    verifyAuditLog: (fromSequence, count) =>
      http.request({
        path: '/v1/audit-verification',
        query: { fromSequence, count },
        auth: true,
        parse: (json) => verifyAuditResponseSchema.parse(json),
      }),
  }
}
