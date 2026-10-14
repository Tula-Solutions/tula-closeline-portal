import {
  type Call,
  type CallState,
  callIdSchema,
  callSchema,
  DEAL_IMPORT_FILE_FIELD,
  type Deal,
  type DealImport,
  type DealRecordId,
  dealImportSchema,
  dealSchema,
  IDEMPOTENCY_KEY_HEADER,
  type ListDealImportRowsResponse,
  type ListDealImportsResponse,
  type ListDealsResponse,
  listDealImportRowsResponseSchema,
  listDealImportsResponseSchema,
  listDealsResponseSchema,
  MAX_CURSOR_LENGTH,
  type Outcome,
  type RightsStatus,
  rightsStatusSchema,
  UPLOAD_FILE_FIELD,
} from 'tula-closeline-contract'
import { z } from 'zod'
import { PAGE_SIZE, type PageRequest } from '~/api/core'
import type { HttpClient } from '~/api/http'
import { onlyStatus, UPLOAD_TIMEOUT_MS } from '~/api/playbook'

/** One page request for Deals: with an Outcome, only Deals with it; `appearedInImport: false` lists Deals no CSV has named. */
export type DealPageRequest = PageRequest & {
  readonly outcome?: Outcome | undefined
  readonly appearedInImport?: boolean | undefined
}

/** One page request for an import's report: `result: 'rejected'` lists only the rows that need fixing. */
export type ImportRowPageRequest = PageRequest & {
  readonly result?: 'applied' | 'rejected' | undefined
}

/** A Call this version of the portal cannot read (a state or reason it does not know): only its id is kept. */
export type UnreadableCall = { readonly unreadable: true; readonly id: string }

/** One entry of a Calls page: a Call, or a placeholder for one that cannot be read. */
export type CallListItem = Call | UnreadableCall

/** One page of Calls. */
export type CallsPage = {
  readonly items: readonly CallListItem[]
  readonly nextCursor: string | null
}

/** Whether a list entry is a placeholder. */
export function isUnreadable(item: CallListItem): item is UnreadableCall {
  return 'unreadable' in item
}

const callsEnvelopeSchema = z.object({
  items: z.array(z.unknown()),
  nextCursor: z.string().min(1).max(MAX_CURSOR_LENGTH).nullable(),
})
const withIdSchema = z.object({ id: callIdSchema })

/**
 * Reads a page of Calls: the envelope and every id strictly (a failure fails the page), each Call
 * on its own, so one the contract of this build does not know becomes a placeholder instead of
 * hiding the others.
 */
function parseCallsPage(json: unknown): CallsPage {
  const envelope = callsEnvelopeSchema.parse(json)
  return {
    nextCursor: envelope.nextCursor,
    items: envelope.items.map((item): CallListItem => {
      const call = callSchema.safeParse(item)
      return call.success ? call.data : { unreadable: true, id: withIdSchema.parse(item).id }
    }),
  }
}

/** One page request for Calls: with a state only Calls in it; with a Deal (by its opaque id) only its Calls. */
export type CallPageRequest = PageRequest & {
  readonly state?: CallState | undefined
  readonly dealRecordId?: string | undefined
}

/** A Call upload: the Transcript, the customer's deal id and the Rep's speaker label. The deal id travels in the multipart body. */
export type CallUpload = {
  readonly file: File
  readonly dealId: string
  readonly repLabel: string
}

/** The answer to a Call upload: `duplicate` when the service already had this content for this Deal (HTTP 200). */
export type CallUploadResult = { readonly call: Call; readonly duplicate: boolean }

/** The sales-history routes the portal uses (Owner and Admin only on the service). */
export type SalesHistoryApi = {
  /** The recorded rights confirmation and the wording version to show. */
  getRights(signal?: AbortSignal): Promise<RightsStatus>
  /** Records the confirmation of the wording version the person was shown. */
  confirmRights(wordingVersion: number): Promise<RightsStatus>
  /** One page of Deals, newest first. */
  listDeals(page: DealPageRequest): Promise<ListDealsResponse>
  /** One Deal by its opaque `deal_` id. */
  getDeal(dealRecordId: DealRecordId | string, signal?: AbortSignal): Promise<Deal>
  /** Finds a Deal by the customer's deal id, which travels in the body only. */
  lookupDeal(customerDealId: string): Promise<Deal>
  /** Sets or corrects a Deal's Outcome. */
  setDealOutcome(dealRecordId: string, outcome: Outcome): Promise<Deal>
  /** One page of Deal imports, newest first. */
  listDealImports(page: PageRequest): Promise<ListDealImportsResponse>
  /** One import with its state and counts. */
  getDealImport(importId: string, signal?: AbortSignal): Promise<DealImport>
  /** One page of an import's report, in CSV order. */
  listDealImportRows(
    importId: string,
    page: ImportRowPageRequest
  ): Promise<ListDealImportRowsResponse>
  /** One page of Calls, newest first. */
  listCalls(page: CallPageRequest): Promise<CallsPage>
  /** Uploads a Transcript for a Deal; the key makes a repeat of the same request answer with the stored Call. */
  uploadCall(
    upload: CallUpload,
    idempotencyKey: string,
    signal?: AbortSignal
  ): Promise<CallUploadResult>
  /** Picks or changes the Rep of a Call by one of its speaker labels. */
  setCallRep(callId: string, label: string): Promise<Call>
  /** Soft-deletes a Call; it can be restored until it is purged. */
  deleteCall(callId: string): Promise<Call>
  /** Restores a soft-deleted Call. */
  restoreCall(callId: string): Promise<Call>
  /** Uploads a CSV; the key makes a repeat of the same request answer with the stored import. */
  uploadDealImport(file: File, idempotencyKey: string, signal?: AbortSignal): Promise<DealImport>
}

const segment = encodeURIComponent
const BASE = '/v1/playbook'

/** Builds the sales-history routes over an HTTP client for same-origin paths, which sends the access token. */
export function createSalesHistoryApi(http: HttpClient): SalesHistoryApi {
  const signalOf = (signal?: AbortSignal) => (signal ? { signal } : {})
  return {
    getRights: (signal) =>
      http.request({
        path: `${BASE}/rights-confirmation`,
        auth: true,
        ...signalOf(signal),
        parse: (json) => rightsStatusSchema.parse(json),
      }),
    confirmRights: (wordingVersion) =>
      http.request({
        method: 'PUT',
        path: `${BASE}/rights-confirmation`,
        body: { wordingVersion },
        auth: true,
        parse: (json) => rightsStatusSchema.parse(json),
      }),
    listDeals: (page) =>
      http.request({
        path: `${BASE}/deals`,
        query: {
          cursor: page.cursor,
          limit: PAGE_SIZE,
          outcome: page.outcome,
          appearedInImport:
            page.appearedInImport === undefined ? undefined : String(page.appearedInImport),
        },
        auth: true,
        ...signalOf(page.signal),
        parse: (json) => listDealsResponseSchema.parse(json),
      }),
    getDeal: (dealRecordId, signal) =>
      http.request({
        path: `${BASE}/deals/${segment(dealRecordId)}`,
        auth: true,
        ...signalOf(signal),
        parse: (json) => dealSchema.parse(json),
      }),
    // A read in effect, but a POST so the customer's deal id is in the body and never in a URL; a
    // POST is sent once and not retried, which is fine for a person pressing a button.
    lookupDeal: (customerDealId) =>
      http.request({
        method: 'POST',
        path: `${BASE}/deals/lookup`,
        body: { dealId: customerDealId },
        auth: true,
        parse: (json) => dealSchema.parse(json),
      }),
    setDealOutcome: (dealRecordId, outcome) =>
      http.request({
        method: 'PUT',
        path: `${BASE}/deals/${segment(dealRecordId)}/outcome`,
        body: { outcome },
        auth: true,
        parse: (json) => dealSchema.parse(json),
      }),
    listDealImports: (page) =>
      http.request({
        path: `${BASE}/deal-imports`,
        query: { cursor: page.cursor, limit: PAGE_SIZE },
        auth: true,
        ...signalOf(page.signal),
        parse: (json) => listDealImportsResponseSchema.parse(json),
      }),
    getDealImport: (importId, signal) =>
      http.request({
        path: `${BASE}/deal-imports/${segment(importId)}`,
        auth: true,
        ...signalOf(signal),
        parse: (json) => dealImportSchema.parse(json),
      }),
    listDealImportRows: (importId, page) =>
      http.request({
        path: `${BASE}/deal-imports/${segment(importId)}/rows`,
        query: { cursor: page.cursor, limit: PAGE_SIZE, result: page.result },
        auth: true,
        ...signalOf(page.signal),
        parse: (json) => listDealImportRowsResponseSchema.parse(json),
      }),
    uploadDealImport: (file, idempotencyKey, signal) => {
      const form = new FormData()
      form.set(DEAL_IMPORT_FILE_FIELD, file, file.name)
      return http.request({
        method: 'POST',
        path: `${BASE}/deal-imports`,
        body: form,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        timeoutMs: UPLOAD_TIMEOUT_MS,
        auth: true,
        ...signalOf(signal),
        parse: (json, status) => {
          onlyStatus(status, 202)
          return dealImportSchema.parse(json)
        },
      })
    },
    listCalls: (page) =>
      http.request({
        path: `${BASE}/calls`,
        query: {
          cursor: page.cursor,
          limit: PAGE_SIZE,
          state: page.state,
          dealRecordId: page.dealRecordId,
        },
        auth: true,
        ...signalOf(page.signal),
        parse: parseCallsPage,
      }),
    uploadCall: (upload, idempotencyKey, signal) => {
      const form = new FormData()
      form.set(UPLOAD_FILE_FIELD, upload.file, upload.file.name)
      // The customer's deal id is a body field, never part of the address.
      form.set('dealId', upload.dealId)
      form.set('rep', JSON.stringify({ by: 'speaker', label: upload.repLabel }))
      return http.request({
        method: 'POST',
        path: `${BASE}/calls`,
        body: form,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        timeoutMs: UPLOAD_TIMEOUT_MS,
        auth: true,
        ...signalOf(signal),
        parse: (json, status) => ({
          duplicate: onlyStatus(status, 200, 201) === 200,
          call: callSchema.parse(json),
        }),
      })
    },
    setCallRep: (callId, label) =>
      http.request({
        method: 'PUT',
        path: `${BASE}/calls/${segment(callId)}/rep`,
        body: { rep: { by: 'speaker', label } },
        auth: true,
        parse: (json) => callSchema.parse(json),
      }),
    deleteCall: (callId) =>
      http.request({
        method: 'DELETE',
        path: `${BASE}/calls/${segment(callId)}`,
        auth: true,
        parse: (json) => callSchema.parse(json),
      }),
    restoreCall: (callId) =>
      http.request({
        method: 'POST',
        path: `${BASE}/calls/${segment(callId)}/restore`,
        auth: true,
        parse: (json) => callSchema.parse(json),
      }),
  }
}
