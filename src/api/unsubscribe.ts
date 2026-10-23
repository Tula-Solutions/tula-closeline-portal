import {
  type UnsubscribePreview,
  type UnsubscribeReceipt,
  unsubscribePreviewSchema,
  unsubscribeReceiptSchema,
} from 'tula-closeline-contract'
import type { HttpClient } from '~/api/http'

/** The public unsubscribe routes of core: no sign-in, only the signed token from the link. */
export type UnsubscribeApi = {
  /** Reads who sent the message and the channel; changes nothing, so a scanner opening the link unsubscribes no one. */
  preview(token: string, signal?: AbortSignal): Promise<UnsubscribePreview>
  /** Unsubscribes by the link (RFC 8058 one-click); a link used again answers the same. */
  unsubscribe(token: string): Promise<UnsubscribeReceipt>
}

/** Builds the unsubscribe routes over an HTTP client for same-origin paths. */
export function createUnsubscribeApi(http: HttpClient): UnsubscribeApi {
  const path = (token: string) => `/v1/public/unsubscribe/${encodeURIComponent(token)}`
  return {
    preview: (token, signal) =>
      http.request({
        method: 'GET',
        path: path(token),
        ...(signal ? { signal } : {}),
        parse: (json) => unsubscribePreviewSchema.parse(json),
      }),
    unsubscribe: (token) =>
      http.request({
        method: 'POST',
        path: path(token),
        body: { 'List-Unsubscribe': 'One-Click' },
        parse: (json) => unsubscribeReceiptSchema.parse(json),
      }),
  }
}
