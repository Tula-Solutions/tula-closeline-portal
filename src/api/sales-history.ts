import {
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
  type Outcome,
  type RightsStatus,
  rightsStatusSchema,
} from 'tula-closeline-contract'
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
  }
}
