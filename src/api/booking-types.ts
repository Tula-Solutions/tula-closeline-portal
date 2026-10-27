import {
  type BookingType,
  bookingTypeSchema,
  type CreateBookingTypeRequest,
  createBookingTypeRequestSchema,
  IDEMPOTENCY_KEY_HEADER,
  updateBookingTypeRequestSchema,
} from 'tula-closeline-contract'
import { z } from 'zod'
import { PAGE_SIZE, type PageRequest } from '~/api/core'
import type { HttpClient } from '~/api/http'

/** One page of Booking Types, newest first. */
export type BookingTypesPage = {
  readonly items: readonly BookingType[]
  readonly nextCursor: string | null
}

type UpdateBookingTypeRequest = z.infer<typeof updateBookingTypeRequestSchema>

const pageSchema = z.object({
  items: z.array(bookingTypeSchema),
  nextCursor: z.string().min(1).nullable(),
})

/** The core routes of Booking Types (Owner and Admin define them; the public token comes from core). */
export type BookingTypesApi = {
  /** One page of the Organization's Booking Types, retired ones included. */
  list(page: PageRequest): Promise<BookingTypesPage>
  /** Defines a Booking Type; core makes its public token and answers a replayed key with the first result. */
  create(body: CreateBookingTypeRequest, idempotencyKey: string): Promise<BookingType>
  /** Changes some fields of a Booking Type. */
  update(id: string, body: UpdateBookingTypeRequest): Promise<BookingType>
  /** Retires a Booking Type: it can no longer be booked; answering again is fine. */
  retire(id: string): Promise<BookingType>
}

const segment = encodeURIComponent

/** Builds the Booking Type routes over an HTTP client for same-origin paths, which sends the access token. */
export function createBookingTypesApi(http: HttpClient): BookingTypesApi {
  const one = (json: unknown) => bookingTypeSchema.parse(json)
  return {
    list: (page) =>
      http.request({
        path: '/v1/booking-types',
        query: { cursor: page.cursor, limit: page.limit ?? PAGE_SIZE },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => pageSchema.parse(json),
      }),
    create: (body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: '/v1/booking-types',
        body: createBookingTypeRequestSchema.parse(body),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: one,
      }),
    update: (id, body) =>
      http.request({
        method: 'PATCH',
        path: `/v1/booking-types/${segment(id)}`,
        body: updateBookingTypeRequestSchema.parse(body),
        auth: true,
        parse: one,
      }),
    retire: (id) =>
      http.request({
        method: 'POST',
        path: `/v1/booking-types/${segment(id)}/retire`,
        auth: true,
        parse: one,
      }),
  }
}
