import {
  type AddSuppressionRequest,
  addSuppressionRequestSchema,
  type ConsentChannel,
  type ConsentEvent,
  type ConsentWording,
  type CreateConsentWordingRequest,
  consentEventPageSchema,
  consentWordingPageSchema,
  consentWordingSchema,
  createConsentWordingRequestSchema,
  IDEMPOTENCY_KEY_HEADER,
  lookupSuppressionRequestSchema,
  type ProspectConsent,
  prospectConsentSchema,
  type RecordConsentRequest,
  type RecordedConsent,
  type RemoveSuppressionRequest,
  recordConsentRequestSchema,
  recordedConsentSchema,
  removeSuppressionRequestSchema,
  type SuppressionAddressKind,
  type SuppressionEntry,
  type SuppressionReason,
  suppressionEntryPageSchema,
  suppressionEntrySchema,
  type UpdateConsentWordingRequest,
  updateConsentWordingRequestSchema,
  type WithdrawConsentRequest,
  withdrawConsentRequestSchema,
} from 'tula-closeline-contract'
import type { z } from 'zod'
import { PAGE_SIZE, type PageRequest } from '~/api/core'
import type { HttpClient } from '~/api/http'

/** The body of an exact-address lookup: exactly one of email, phone or LinkedIn address. */
export type LookupSuppressionRequest = z.infer<typeof lookupSuppressionRequestSchema>

/** One page of a Prospect's consent ledger, newest first. */
export type ConsentEventsPage = z.infer<typeof consentEventPageSchema>

/** One page of Consent Wordings. */
export type ConsentWordingsPage = z.infer<typeof consentWordingPageSchema>

/** One page of Suppression entries. */
export type SuppressionPage = z.infer<typeof suppressionEntryPageSchema>

/** What a page of Suppression entries may be narrowed by; each is sent only when set. */
export type SuppressionFilter = {
  readonly reason?: SuppressionReason | undefined
  readonly addressKind?: SuppressionAddressKind | undefined
  readonly state?: 'active' | 'removed' | undefined
}

/** The Contact Consent and Suppression routes of core that the portal uses. */
export type ConsentApi = {
  /** The state of every channel of a Prospect, and whether the Prospect is suppressed. */
  getProspectConsent(prospectId: string, signal?: AbortSignal): Promise<ProspectConsent>
  /** One page of a Prospect's consent ledger, newest first, optionally for one channel. */
  listConsentEvents(
    prospectId: string,
    page: PageRequest & { readonly channel?: ConsentChannel | undefined }
  ): Promise<ConsentEventsPage>
  /** One page of Consent Wordings. */
  listConsentWordings(page: PageRequest): Promise<ConsentWordingsPage>
  /** Writes a new Consent Wording (version 1); Owner and Admin. The key makes a repeat write one. */
  createConsentWording(
    body: CreateConsentWordingRequest,
    idempotencyKey: string
  ): Promise<ConsentWording>
  /** Edits a Consent Wording nothing uses yet; a used one is `consent.wording_locked`. */
  updateConsentWording(
    wordingId: string,
    body: UpdateConsentWordingRequest
  ): Promise<ConsentWording>
  /** Writes the next version of a Consent Wording; the old one stays as it was. */
  createConsentWordingVersion(
    wordingId: string,
    body: CreateConsentWordingRequest,
    idempotencyKey: string
  ): Promise<ConsentWording>
  /** Records a grant with its evidence; the key makes a repeat of the same request record one grant. */
  recordConsent(
    prospectId: string,
    body: RecordConsentRequest,
    idempotencyKey: string
  ): Promise<RecordedConsent>
  /** Withdraws consent on some channels or on all of them; the key makes a repeat withdraw once. */
  withdrawConsent(
    prospectId: string,
    body: WithdrawConsentRequest,
    idempotencyKey: string
  ): Promise<RecordedConsent>
  /** One page of Suppression entries (Owner, Admin). */
  listSuppressionEntries(page: PageRequest & SuppressionFilter): Promise<SuppressionPage>
  /** The entries for one exact address; the address travels in the body, never the URL. */
  lookupSuppression(body: LookupSuppressionRequest, signal?: AbortSignal): Promise<SuppressionPage>
  /** Adds an address by hand; the key makes a repeat add it once. */
  addSuppression(body: AddSuppressionRequest, idempotencyKey: string): Promise<SuppressionEntry>
  /** Removes an entry that was added by hand, recording why. */
  removeSuppression(entryId: string, body: RemoveSuppressionRequest): Promise<SuppressionEntry>
}

export type { ConsentEvent, ConsentWording }

const segment = encodeURIComponent

/** Builds the consent routes over an HTTP client for same-origin paths, which sends the access token. */
export function createConsentApi(http: HttpClient): ConsentApi {
  const query = (page: PageRequest) => ({ cursor: page.cursor, limit: page.limit ?? PAGE_SIZE })
  return {
    getProspectConsent: (prospectId, signal) =>
      http.request({
        path: `/v1/prospects/${segment(prospectId)}/consent`,
        auth: true,
        signal,
        parse: (json) => prospectConsentSchema.parse(json),
      }),
    listConsentEvents: (prospectId, page) =>
      http.request({
        path: `/v1/prospects/${segment(prospectId)}/consent-events`,
        query: { ...query(page), channel: page.channel },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => consentEventPageSchema.parse(json),
      }),
    listConsentWordings: (page) =>
      http.request({
        path: '/v1/consent-wordings',
        query: query(page),
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => consentWordingPageSchema.parse(json),
      }),
    createConsentWording: (body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: '/v1/consent-wordings',
        body: createConsentWordingRequestSchema.parse(body),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => consentWordingSchema.parse(json),
      }),
    updateConsentWording: (wordingId, body) =>
      http.request({
        method: 'PATCH',
        path: `/v1/consent-wordings/${segment(wordingId)}`,
        body: updateConsentWordingRequestSchema.parse(body),
        auth: true,
        parse: (json) => consentWordingSchema.parse(json),
      }),
    createConsentWordingVersion: (wordingId, body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: `/v1/consent-wordings/${segment(wordingId)}/versions`,
        body: createConsentWordingRequestSchema.parse(body),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => consentWordingSchema.parse(json),
      }),
    recordConsent: (prospectId, body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: `/v1/prospects/${segment(prospectId)}/consents`,
        body: recordConsentRequestSchema.parse(body),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => recordedConsentSchema.parse(json),
      }),
    withdrawConsent: (prospectId, body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: `/v1/prospects/${segment(prospectId)}/consent-withdrawals`,
        body: withdrawConsentRequestSchema.parse(body),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => recordedConsentSchema.parse(json),
      }),
    listSuppressionEntries: (page) =>
      http.request({
        path: '/v1/suppression-entries',
        query: {
          ...query(page),
          reason: page.reason,
          addressKind: page.addressKind,
          state: page.state,
        },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => suppressionEntryPageSchema.parse(json),
      }),
    lookupSuppression: (body, signal) =>
      http.request({
        method: 'POST',
        path: '/v1/suppression-entries/lookups',
        body: lookupSuppressionRequestSchema.parse(body),
        auth: true,
        ...(signal ? { signal } : {}),
        parse: (json) => suppressionEntryPageSchema.parse(json),
      }),
    addSuppression: (body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: '/v1/suppression-entries',
        body: addSuppressionRequestSchema.parse(body),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => suppressionEntrySchema.parse(json),
      }),
    removeSuppression: (entryId, body) =>
      http.request({
        method: 'POST',
        path: `/v1/suppression-entries/${segment(entryId)}/removal`,
        body: removeSuppressionRequestSchema.parse(body),
        auth: true,
        parse: (json) => suppressionEntrySchema.parse(json),
      }),
  }
}
