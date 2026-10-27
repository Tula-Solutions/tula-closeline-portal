import {
  type AgentKind,
  type Assessment,
  type AssessmentRateItem,
  type AssessmentVerdict,
  type FINDING_FEEDBACKS,
  type Finding,
  type FindingCategory,
  findingSchema,
  getAssessmentRatesResponseSchema,
  IDEMPOTENCY_KEY_HEADER,
  listAssessmentsResponseSchema,
} from 'tula-closeline-contract'
import type { PageRequest } from '~/api/core'
import type { HttpClient } from '~/api/http'

/** What a person can say about a finding. */
export type FindingFeedback = (typeof FINDING_FEEDBACKS)[number]

/** The most assessments one page holds (core's page maximum); the portal asks for fewer. */
export const ASSESSMENT_PAGE_MAX = 100

/** What the list of assessments may be narrowed by; each is sent only when set. `from` and `to` are calendar dates (YYYY-MM-DD). */
export type AssessmentFilter = {
  readonly verdict?: AssessmentVerdict | undefined
  readonly category?: FindingCategory | undefined
  readonly agentKind?: AgentKind | undefined
  readonly from?: string | undefined
  readonly to?: string | undefined
}

/** One page of assessments, newest first (worst first when asked). */
export type AssessmentsPage = {
  readonly items: readonly Assessment[]
  readonly nextCursor: string | null
}

/** One page of weekly failure rates, oldest week first. */
export type AssessmentRatesPage = {
  readonly items: readonly AssessmentRateItem[]
  readonly nextCursor: string | null
}

/** The core routes the portal uses to review assessed Agent output (Owner and Admin). */
export type AssessmentsApi = {
  /** One page of assessments narrowed by the filter, worst first (so flagged ones lead). */
  listAssessments(page: PageRequest & AssessmentFilter): Promise<AssessmentsPage>
  /** Tells core whether a finding was right; the key makes a repeat record it once. */
  giveFeedback(
    assessmentId: string,
    findingId: string,
    feedback: FindingFeedback,
    idempotencyKey: string
  ): Promise<Finding>
  /** One page of weekly failure rates for the range (at most 13 months), oldest week first. */
  listRates(
    range: {
      readonly from: string
      readonly to: string
      readonly agentKind?: AgentKind | undefined
    },
    page: PageRequest
  ): Promise<AssessmentRatesPage>
}

/** Path segment safe for an id from the server. */
function segment(value: string): string {
  return encodeURIComponent(value)
}

/** The filter as query parameters, leaving out what is empty. */
function filterQuery(filter: AssessmentFilter): Record<string, string> {
  const query: Record<string, string> = {}
  for (const [name, value] of Object.entries(filter)) {
    if (typeof value === 'string' && value !== '') {
      query[name] = value
    }
  }
  return query
}

/** Builds the assessment routes over an HTTP client for same-origin paths, which sends the access token. */
export function createAssessmentsApi(http: HttpClient): AssessmentsApi {
  return {
    listAssessments: (page) => {
      const { cursor, limit, signal, ...filter } = page
      return http.request({
        path: '/v1/assessments',
        query: {
          ...filterQuery(filter),
          cursor,
          limit: Math.min(limit ?? 25, ASSESSMENT_PAGE_MAX),
        },
        auth: true,
        ...(signal ? { signal } : {}),
        parse: (json) => listAssessmentsResponseSchema.parse(json),
      })
    },
    giveFeedback: (assessmentId, findingId, feedback, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: `/v1/assessments/${segment(assessmentId)}/findings/${segment(findingId)}/feedback`,
        body: { feedback },
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => findingSchema.parse(json),
      }),
    listRates: (range, page) =>
      http.request({
        path: '/v1/assessment-rates',
        query: {
          from: range.from,
          to: range.to,
          ...(range.agentKind ? { agentKind: range.agentKind } : {}),
          cursor: page.cursor,
          limit: Math.min(page.limit ?? ASSESSMENT_PAGE_MAX, ASSESSMENT_PAGE_MAX),
        },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => getAssessmentRatesResponseSchema.parse(json),
      }),
  }
}
