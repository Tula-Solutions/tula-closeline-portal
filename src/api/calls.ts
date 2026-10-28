import { IDEMPOTENCY_KEY_HEADER } from 'tula-closeline-contract'
import { z } from 'zod'
import type { HttpClient } from '~/api/http'

/** Calls are not in the contract yet, so the portal reads the fields it shows from voice's vendored spec; replace this when the contract adds them. */
export const callSchema = z.object({
  id: z.string(),
  direction: z.enum(['inbound', 'outbound']),
  state: z.enum(['ringing', 'connecting', 'disclosing', 'live', 'ended', 'failed', 'missed']),
  prospectNumber: z.string(),
  disclosure: z.object({
    wordingVersion: z.number().int().nullable(),
    playedAt: z.string().nullable(),
  }),
  failureReason: z.string().nullable().optional(),
})

/** One Call as the softphone shows it. */
export type SoftphoneCall = z.infer<typeof callSchema>

const callPageSchema = z.object({ items: z.array(callSchema) })

/** Placing a Call plays the Disclosure before it answers, so allow longer than the usual 10 s. */
const PLACE_TIMEOUT_MS = 30_000

/** The voice routes the softphone uses. */
export type CallsApi = {
  /** Places a Call to `to`; the key makes a repeat of the same press place one Call. */
  place(to: string, idempotencyKey: string): Promise<SoftphoneCall>
  /** Reads one Call. */
  get(callId: string, signal?: AbortSignal): Promise<SoftphoneCall>
  /** Answers a ringing inbound Call; the Disclosure plays, then the Rep is bridged. */
  answer(callId: string): Promise<SoftphoneCall>
  /** The inbound Calls ringing for the caller now (one small page). */
  listRinging(signal?: AbortSignal): Promise<readonly SoftphoneCall[]>
}

/** Builds the Call routes over an HTTP client for same-origin paths. */
export function createCallsApi(http: HttpClient): CallsApi {
  const path = (id: string) => `/v1/calls/${encodeURIComponent(id)}`
  return {
    place: (to, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: '/v1/calls',
        body: { to },
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        timeoutMs: PLACE_TIMEOUT_MS,
        auth: true,
        parse: (json) => z.object({ call: callSchema }).parse(json).call,
      }),
    get: (callId, signal) =>
      http.request({ path: path(callId), auth: true, signal, parse: (j) => callSchema.parse(j) }),
    answer: (callId) =>
      http.request({
        method: 'POST',
        path: `${path(callId)}/answer`,
        auth: true,
        parse: (j) => callSchema.parse(j),
      }),
    listRinging: (signal) =>
      http.request({
        path: '/v1/calls',
        query: { state: 'ringing', direction: 'inbound', limit: 5 },
        auth: true,
        signal,
        parse: (j) => callPageSchema.parse(j).items,
      }),
  }
}
