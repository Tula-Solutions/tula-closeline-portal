import {
  type CopilotStreamMessage,
  copilotStreamMessageSchema,
  IDEMPOTENCY_KEY_HEADER,
  softphoneTokenSchema,
} from 'tula-closeline-contract'
import { z } from 'zod'
import type { HttpClient } from '~/api/http'
import { readFrames } from '~/api/sse'

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

/** The server closes a stream after a few minutes; this is the ceiling for one read of it. */
const STREAM_TIMEOUT_MS = 10 * 60_000

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** The voice routes the softphone uses. */
export type CallsApi = {
  /** Places a Call to `to`, with the Copilot on or off; the key makes a repeat of the same press place one Call. */
  place(to: string, copilot: boolean, idempotencyKey: string): Promise<SoftphoneCall>
  /** Follows a Call's live Transcript, resuming after `lastEventId`; resolves when the server closes the stream. */
  stream(
    callId: string,
    lastEventId: string | undefined,
    onMessage: (message: CopilotStreamMessage) => void,
    signal: AbortSignal
  ): Promise<void>
  /** Reads one Call. */
  get(callId: string, signal?: AbortSignal): Promise<SoftphoneCall>
  /** Answers a ringing inbound Call; the Disclosure plays, then the Rep is bridged. */
  answer(callId: string): Promise<SoftphoneCall>
  /** Ends the Call at the provider; a live Call becomes ended. */
  hangUp(callId: string): Promise<SoftphoneCall>
  /** Mints a short-lived Voice SDK token for the caller's browser. */
  token(): Promise<string>
  /** The inbound Calls ringing for the caller now (one small page). */
  listRinging(signal?: AbortSignal): Promise<readonly SoftphoneCall[]>
}

/** Builds the Call routes over an HTTP client for same-origin paths. */
export function createCallsApi(http: HttpClient): CallsApi {
  const path = (id: string) => `/v1/calls/${encodeURIComponent(id)}`
  return {
    place: (to, copilot, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: '/v1/calls',
        body: { to, copilot },
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        timeoutMs: PLACE_TIMEOUT_MS,
        auth: true,
        parse: (json) => z.object({ call: callSchema }).parse(json).call,
      }),
    stream: (callId, lastEventId, onMessage, signal) =>
      http.request({
        path: `${path(callId)}/copilot/stream`,
        auth: true,
        signal,
        timeoutMs: STREAM_TIMEOUT_MS,
        headers: {
          accept: 'text/event-stream',
          ...(lastEventId === undefined ? {} : { 'last-event-id': lastEventId }),
        },
        read: async (response) => {
          if (response.body === null) {
            throw new Error('The stream has no body')
          }
          await readFrames(response.body, (frame) => {
            // A frame that is not a known message (a newer event) is skipped, not fatal.
            const parsed = copilotStreamMessageSchema.safeParse({
              id: frame.id,
              event: frame.event,
              data: parseJson(frame.data),
            })
            if (parsed.success) {
              onMessage(parsed.data)
            }
          })
        },
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
    hangUp: (callId) =>
      http.request({
        method: 'POST',
        path: `${path(callId)}/hangup`,
        auth: true,
        parse: (j) => callSchema.parse(j),
      }),
    token: () =>
      http.request({
        method: 'POST',
        path: '/v1/softphone/token',
        auth: true,
        parse: (j) => softphoneTokenSchema.parse(j).token,
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
