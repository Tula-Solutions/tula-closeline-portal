import {
  type RecordingPlayback,
  recordingPlaybackSchema,
  type TranscriptPage,
  transcriptPageSchema,
  type VoiceCall,
  voiceCallPageSchema,
  voiceCallSchema,
  type WrapUpRequest,
} from 'tula-closeline-contract'
import { PAGE_SIZE, type PageRequest } from '~/api/core'
import type { HttpClient } from '~/api/http'

/** One page of Calls, newest first. */
export type CallPage = { readonly items: readonly VoiceCall[]; readonly nextCursor: string | null }

/** What the Call list can be narrowed by; an empty field sends nothing. */
export type CallFilters = {
  readonly direction: '' | 'inbound' | 'outbound'
  readonly state: string
  readonly repMembershipId: string
  readonly from: string
  readonly to: string
}

/** The voice routes behind the Calls history, a Call's Transcript and its Recording. */
export type CallHistoryApi = {
  /** One page of Calls the caller may see (a Rep their own, a Manager their Team's, an Admin all), newest first. */
  list(filters: CallFilters, page: PageRequest): Promise<CallPage>
  /** One Call. */
  get(callId: string, signal?: AbortSignal): Promise<VoiceCall>
  /** One page of a Call's Transcript turns; empty until the Transcript is ready. */
  transcript(callId: string, page: PageRequest): Promise<TranscriptPage>
  /** A short-lived signed URL for the Recording; it is a bearer credential, so never store or log it. */
  recording(callId: string): Promise<RecordingPlayback>
  /** Deletes the Recording and its Transcript (Owner, Admin) and returns the Call. */
  deleteRecording(callId: string): Promise<VoiceCall>
  /** Sets the Deal identifier and note of an ended Call; a field left out stays, null clears it. */
  wrapUp(callId: string, body: WrapUpRequest): Promise<VoiceCall>
}

const segment = encodeURIComponent

/** Builds the Calls history routes over an HTTP client for same-origin paths, which sends the access token. */
export function createCallHistoryApi(http: HttpClient): CallHistoryApi {
  return {
    list: (filters, page) =>
      http.request({
        path: '/v1/calls',
        query: {
          cursor: page.cursor,
          limit: page.limit ?? PAGE_SIZE,
          direction: filters.direction || undefined,
          state: filters.state || undefined,
          repMembershipId: filters.repMembershipId || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
        },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => voiceCallPageSchema.parse(json),
      }),
    get: (callId, signal) =>
      http.request({
        path: `/v1/calls/${segment(callId)}`,
        auth: true,
        signal,
        parse: (json) => voiceCallSchema.parse(json),
      }),
    transcript: (callId, page) =>
      http.request({
        path: `/v1/calls/${segment(callId)}/transcript`,
        query: { cursor: page.cursor, limit: page.limit ?? PAGE_SIZE },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => transcriptPageSchema.parse(json),
      }),
    recording: (callId) =>
      http.request({
        path: `/v1/calls/${segment(callId)}/recording`,
        auth: true,
        parse: (json) => recordingPlaybackSchema.parse(json),
      }),
    deleteRecording: (callId) =>
      http.request({
        method: 'DELETE',
        path: `/v1/calls/${segment(callId)}/recording`,
        auth: true,
        parse: (json) => voiceCallSchema.parse(json),
      }),
    wrapUp: (callId, body) =>
      http.request({
        method: 'PUT',
        path: `/v1/calls/${segment(callId)}/wrap-up`,
        body,
        auth: true,
        parse: (json) => voiceCallSchema.parse(json),
      }),
  }
}
