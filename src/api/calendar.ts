import {
  type Availability,
  availabilitySchema,
  type CalendarConnection,
  calendarConnectionSchema,
  completeCalendarConnectionRequestSchema,
  startCalendarConnectionRequestSchema,
  startCalendarConnectionResponseSchema,
} from 'tula-closeline-contract'
import type { z } from 'zod'
import { ApiError } from '~/api/errors'
import type { HttpClient } from '~/api/http'

/** Where to send the Rep to consent, and the `state` that comes back with the vendor's code. */
export type CalendarStart = z.infer<typeof startCalendarConnectionResponseSchema>

/** The core routes of the caller's own calendar and working hours. */
export type CalendarApi = {
  /** Starts connecting the caller's Google calendar. */
  start(): Promise<CalendarStart>
  /** Completes the connection with what the vendor returned; the code is used once and never kept. */
  complete(state: string, code: string): Promise<CalendarConnection>
  /** The caller's Calendar Connection, or null when none exists (`calendar.not_connected`). */
  get(signal?: AbortSignal): Promise<CalendarConnection | null>
  /** Disconnects the caller's calendar; answering again when it is already gone is fine. */
  disconnect(): Promise<void>
  /** The caller's time zone and weekly hours. */
  getAvailability(signal?: AbortSignal): Promise<Availability>
  /** Replaces the caller's time zone and weekly hours. */
  setAvailability(body: Availability): Promise<Availability>
}

/** Builds the calendar routes over an HTTP client for same-origin paths, which sends the access token. */
export function createCalendarApi(http: HttpClient): CalendarApi {
  return {
    start: () =>
      http.request({
        method: 'POST',
        path: '/v1/calendar-connection/start',
        body: startCalendarConnectionRequestSchema.parse({ provider: 'google' }),
        auth: true,
        parse: (json) => startCalendarConnectionResponseSchema.parse(json),
      }),
    complete: (state, code) =>
      http.request({
        method: 'POST',
        path: '/v1/calendar-connection/complete',
        body: completeCalendarConnectionRequestSchema.parse({ state, code }),
        auth: true,
        parse: (json) => calendarConnectionSchema.parse(json),
      }),
    get: async (signal) => {
      try {
        return await http.request({
          path: '/v1/calendar-connection',
          auth: true,
          signal,
          parse: (json) => calendarConnectionSchema.parse(json),
        })
      } catch (failure) {
        if (failure instanceof ApiError && failure.code === 'calendar.not_connected') {
          return null
        }
        throw failure
      }
    },
    disconnect: () =>
      http.request({ method: 'DELETE', path: '/v1/calendar-connection', auth: true }),
    getAvailability: (signal) =>
      http.request({
        path: '/v1/availability',
        auth: true,
        signal,
        parse: (json) => availabilitySchema.parse(json),
      }),
    setAvailability: (body) =>
      http.request({
        method: 'PUT',
        path: '/v1/availability',
        body: availabilitySchema.parse(body),
        auth: true,
        parse: (json) => availabilitySchema.parse(json),
      }),
  }
}
