import {
  type AddLineRequest,
  type AssignLineRequest,
  IDEMPOTENCY_KEY_HEADER,
  type Line,
  linePageSchema,
  lineSchema,
} from 'tula-closeline-contract'
import { PAGE_SIZE, type PageRequest } from '~/api/core'
import type { HttpClient } from '~/api/http'

/** One page of Lines, newest first. */
export type LinesPage = { readonly items: readonly Line[]; readonly nextCursor: string | null }

/** The voice service routes the portal uses (the Lines admin). */
export type VoiceApi = {
  /** One page of the Organization's Lines (Owner, Admin); released ones are listed too. */
  listLines(page: PageRequest): Promise<LinesPage>
  /** Buys or ports a Line; the key makes a repeat of the same request add one number. */
  addLine(body: AddLineRequest, idempotencyKey: string): Promise<Line>
  /** Sets who inbound Calls on a Line ring: a Team, a Rep or nobody. */
  assignLine(lineId: string, assignment: AssignLineRequest): Promise<Line>
  /** Gives a Line up; it cannot be changed afterwards. */
  releaseLine(lineId: string): Promise<Line>
}

const segment = encodeURIComponent

/** Builds the voice routes over an HTTP client for same-origin paths, which sends the access token. */
export function createVoiceApi(http: HttpClient): VoiceApi {
  return {
    listLines: (page) =>
      http.request({
        path: '/v1/lines',
        query: { cursor: page.cursor, limit: page.limit ?? PAGE_SIZE },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => linePageSchema.parse(json),
      }),
    addLine: (body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: '/v1/lines',
        body,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => lineSchema.parse(json),
      }),
    assignLine: (lineId, assignment) =>
      http.request({
        method: 'PUT',
        path: `/v1/lines/${segment(lineId)}/assignment`,
        body: assignment,
        auth: true,
        parse: (json) => lineSchema.parse(json),
      }),
    releaseLine: (lineId) =>
      http.request({
        method: 'POST',
        path: `/v1/lines/${segment(lineId)}/release`,
        auth: true,
        parse: (json) => lineSchema.parse(json),
      }),
  }
}
