import {
  type Booking,
  bookingPageSchema,
  bookingSchema,
  rescheduleBookingRequestSchema,
  type Slot,
  slotPageSchema,
} from 'tula-closeline-contract'
import type { z } from 'zod'
import { PAGE_SIZE, type PageRequest } from '~/api/core'
import type { HttpClient } from '~/api/http'

/** One page of Bookings, latest start first. */
export type BookingsPage = z.infer<typeof bookingPageSchema>

/** One page of free times, earliest first. */
export type SlotsPage = z.infer<typeof slotPageSchema>

/** Which Bookings to list: those starting from a moment on, or those starting up to one. Core decides whose they are. */
export type BookingsRange = { readonly from?: string; readonly to?: string }

/** What a request for free times names: the Booking Type, the Prospect and the range (14 days at most). */
export type SlotsRequest = {
  readonly bookingTypeId: string
  readonly prospectId: string
  readonly from: string
  readonly to: string
}

/** The core routes of Bookings, scoped by core to the caller's role. */
export type BookingsApi = {
  /** One page of Bookings in a range, latest start first. */
  list(range: BookingsRange, page: PageRequest): Promise<BookingsPage>
  /** Cancels a Booking; idempotent by end state, so cancelling a cancelled Booking answers it again. */
  cancel(id: string): Promise<Booking>
  /** Moves a Booking to another start; the length stays. */
  reschedule(id: string, startsAt: string): Promise<Booking>
  /** One page of free times for a Booking Type and Prospect, each naming the Rep who would take it. */
  slots(request: SlotsRequest, page: PageRequest): Promise<SlotsPage>
}

const segment = encodeURIComponent

/** Builds the Booking routes over an HTTP client for same-origin paths, which sends the access token. */
export function createBookingsApi(http: HttpClient): BookingsApi {
  const one = (json: unknown) => bookingSchema.parse(json)
  return {
    list: (range, page) =>
      http.request({
        path: '/v1/bookings',
        query: {
          from: range.from,
          to: range.to,
          cursor: page.cursor,
          limit: page.limit ?? PAGE_SIZE,
        },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => bookingPageSchema.parse(json),
      }),
    cancel: (id) =>
      http.request({
        method: 'POST',
        path: `/v1/bookings/${segment(id)}/cancel`,
        auth: true,
        parse: one,
      }),
    reschedule: (id, startsAt) =>
      http.request({
        method: 'POST',
        path: `/v1/bookings/${segment(id)}/reschedule`,
        body: rescheduleBookingRequestSchema.parse({ startsAt }),
        auth: true,
        parse: one,
      }),
    slots: (request, page) =>
      http.request({
        path: '/v1/booking-slots',
        query: { ...request, cursor: page.cursor, limit: page.limit ?? PAGE_SIZE },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => slotPageSchema.parse(json),
      }),
  }
}

/** A free time of a Booking's own Rep, the only kind a Booking is moved to. */
export const ofRep = (slots: readonly Slot[], repMembershipId: string): Slot[] =>
  slots.filter((slot) => slot.repMembershipId === repMembershipId)
