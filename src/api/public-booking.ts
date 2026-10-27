import {
  IDEMPOTENCY_KEY_HEADER,
  type PublicBookingConfirmation,
  type PublicBookRequest,
  publicBookingConfirmationSchema,
  publicBookRequestSchema,
  publicSlotPageSchema,
} from 'tula-closeline-contract'
import type { z } from 'zod'
import type { HttpClient } from '~/api/http'

/** One page of free times with the Booking Type they belong to. */
export type PublicSlotPage = z.infer<typeof publicSlotPageSchema>

/** The range and page of free times to ask for. */
export type PublicSlotsQuery = {
  readonly from: string
  readonly to: string
  readonly cursor?: string | undefined
  readonly limit?: number
  readonly signal?: AbortSignal | undefined
}

/** The public booking routes of core: no sign-in, only the Booking Type's secret token in the path. */
export type PublicBookingApi = {
  /** One page of free times, earliest first, with the Booking Type's name, length and mode. */
  listSlots(token: string, query: PublicSlotsQuery): Promise<PublicSlotPage>
  /** Books a time; a replay of the same key answers the first confirmation. */
  book(
    token: string,
    body: PublicBookRequest,
    idempotencyKey: string
  ): Promise<PublicBookingConfirmation>
}

/** Builds the public booking routes over an HTTP client for same-origin paths; it sends no access token. */
export function createPublicBookingApi(http: HttpClient): PublicBookingApi {
  const base = (token: string) => `/v1/public/booking-types/${encodeURIComponent(token)}`
  return {
    listSlots: (token, query) =>
      http.request({
        path: `${base(token)}/slots`,
        query: { from: query.from, to: query.to, cursor: query.cursor, limit: query.limit },
        ...(query.signal ? { signal: query.signal } : {}),
        parse: (json) => publicSlotPageSchema.parse(json),
      }),
    book: (token, body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: `${base(token)}/bookings`,
        body: publicBookRequestSchema.parse(body),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        parse: (json) => publicBookingConfirmationSchema.parse(json),
      }),
  }
}
