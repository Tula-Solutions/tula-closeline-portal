import {
  type CitationRef,
  type DocumentState,
  documentSchema,
  IDEMPOTENCY_KEY_HEADER,
  type LearningSettings,
  type ListDocumentsResponse,
  learningSettingsSchema,
  listDocumentsResponseSchema,
  listSuggestionsResponseSchema,
  type PlaybookDocument,
  type ResolveCitationsResponse,
  resolveCitationsResponseSchema,
  type SearchDocumentsRequest,
  type SearchDocumentsResponse,
  type Suggestion,
  type SuggestionStatus,
  searchDocumentsResponseSchema,
  suggestionSchema,
  UPLOAD_FILE_FIELD,
} from 'tula-closeline-contract'
import { PAGE_SIZE, type PageRequest } from '~/api/core'
import type { HttpClient } from '~/api/http'

/** An upload can take far longer than a read: a 25 MB file on a slow line. */
export const UPLOAD_TIMEOUT_MS = 120_000

/** What an upload answered: the stored document, and whether the content was already there (HTTP 200, not 201). */
export type UploadResult = { readonly document: PlaybookDocument; readonly duplicate: boolean }

/** One page request for documents: with a state, only documents in it (`deleted` lists the restorable ones). */
export type DocumentPageRequest = PageRequest & { readonly state?: DocumentState | undefined }

/** One page of Suggestions as the service answers it. */
export type SuggestionsPage = {
  readonly items: readonly Suggestion[]
  readonly nextCursor: string | null
}

/** One page request for Suggestions: with a status, only Suggestions in it. */
export type SuggestionPageRequest = PageRequest & { readonly status?: SuggestionStatus | undefined }

/** The playbook service routes the portal uses. */
export type PlaybookApi = {
  /** Searches the Organization's Documents for text like the conversation so far. The body is conversation text: it is sent, never logged. */
  searchDocuments(
    request: SearchDocumentsRequest,
    signal?: AbortSignal
  ): Promise<SearchDocumentsResponse>
  /** One page of documents, newest first; without a state, every document that is not deleted. */
  listDocuments(page: DocumentPageRequest): Promise<ListDocumentsResponse>
  /** Uploads one file (Owner, Admin); the key makes a repeat of the same upload store it once. */
  uploadDocument(file: File, idempotencyKey: string, signal?: AbortSignal): Promise<UploadResult>
  /** Soft-deletes a document (Owner, Admin); it can be restored until its purge time. */
  deleteDocument(documentId: string): Promise<PlaybookDocument>
  /** Restores a soft-deleted document (Owner, Admin). */
  restoreDocument(documentId: string): Promise<PlaybookDocument>
  /** One page of Suggestions (Owner, Admin), newest first, in one status. */
  listSuggestions(page: SuggestionPageRequest): Promise<SuggestionsPage>
  /** Accepts a pending Suggestion (Owner, Admin), as it stands or with edited text; the key makes a repeat decide once. */
  acceptSuggestion(
    id: string,
    text: string | undefined,
    idempotencyKey: string
  ): Promise<Suggestion>
  /** Rejects a pending Suggestion (Owner, Admin); the key makes a repeat decide once. */
  rejectSuggestion(id: string, idempotencyKey: string): Promise<Suggestion>
  /** Whether Suggestions may be drawn from Agent Moments (Owner, Admin). */
  getLearningSettings(signal?: AbortSignal): Promise<LearningSettings>
  /** Turns learning from Agent Moments on or off (Owner, Admin). */
  setLearningSettings(settings: LearningSettings): Promise<LearningSettings>
  /** Reads the text of the Moments a Suggestion cites; the body is only ids, and the read needs no key. */
  resolveCitations(
    refs: readonly CitationRef[],
    signal?: AbortSignal
  ): Promise<ResolveCitationsResponse>
}

const segment = encodeURIComponent

/**
 * Passes `status` through only if the route documents it. Any other success code (a 202 from a
 * proxy, say) is not an answer this client understands, so it throws and the HTTP client turns it
 * into `client.bad_response`, a failure whose outcome is unknown.
 */
export function onlyStatus<S extends number>(status: number, ...allowed: readonly S[]): S {
  if (!allowed.includes(status as S)) {
    throw new Error(`unexpected status ${status}`)
  }
  return status as S
}

/** Builds the playbook routes over an HTTP client for same-origin paths, which sends the access token. */
export function createPlaybookApi(http: HttpClient): PlaybookApi {
  return {
    searchDocuments: (request, signal) =>
      http.request({
        method: 'POST',
        path: '/v1/playbook/search/documents',
        body: request,
        auth: true,
        ...(signal ? { signal } : {}),
        parse: (json) => searchDocumentsResponseSchema.parse(json),
      }),
    listDocuments: (page) =>
      http.request({
        path: '/v1/playbook/documents',
        query: { cursor: page.cursor, limit: page.limit ?? PAGE_SIZE, state: page.state },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => listDocumentsResponseSchema.parse(json),
      }),
    uploadDocument: (file, idempotencyKey, signal) => {
      const form = new FormData()
      form.set(UPLOAD_FILE_FIELD, file, file.name)
      return http.request<UploadResult>({
        method: 'POST',
        path: '/v1/playbook/documents',
        body: form,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        timeoutMs: UPLOAD_TIMEOUT_MS,
        auth: true,
        ...(signal ? { signal } : {}),
        parse: (json, status) => ({
          document: documentSchema.parse(json),
          duplicate: onlyStatus(status, 200, 201) === 200,
        }),
      })
    },
    deleteDocument: (documentId) =>
      http.request({
        method: 'DELETE',
        path: `/v1/playbook/documents/${segment(documentId)}`,
        auth: true,
        parse: (json, status) => {
          onlyStatus(status, 200)
          return documentSchema.parse(json)
        },
      }),
    restoreDocument: (documentId) =>
      http.request({
        method: 'POST',
        path: `/v1/playbook/documents/${segment(documentId)}/restore`,
        auth: true,
        parse: (json, status) => {
          onlyStatus(status, 200)
          return documentSchema.parse(json)
        },
      }),
    listSuggestions: (page) =>
      http.request({
        path: '/v1/playbook/suggestions',
        query: { cursor: page.cursor, limit: page.limit ?? PAGE_SIZE, status: page.status },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => listSuggestionsResponseSchema.parse(json),
      }),
    acceptSuggestion: (id, text, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: `/v1/playbook/suggestions/${segment(id)}/accept`,
        body: text === undefined ? {} : { text },
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json, status) => {
          onlyStatus(status, 200)
          return suggestionSchema.parse(json)
        },
      }),
    rejectSuggestion: (id, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: `/v1/playbook/suggestions/${segment(id)}/reject`,
        body: {},
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json, status) => {
          onlyStatus(status, 200)
          return suggestionSchema.parse(json)
        },
      }),
    getLearningSettings: (signal) =>
      http.request({
        path: '/v1/playbook/settings/learning',
        auth: true,
        ...(signal ? { signal } : {}),
        parse: (json) => learningSettingsSchema.parse(json),
      }),
    setLearningSettings: (settings) =>
      http.request({
        method: 'PUT',
        path: '/v1/playbook/settings/learning',
        body: settings,
        auth: true,
        parse: (json) => learningSettingsSchema.parse(json),
      }),
    resolveCitations: (refs, signal) =>
      http.request({
        method: 'POST',
        path: '/v1/playbook/citations/resolve',
        body: { refs },
        auth: true,
        ...(signal ? { signal } : {}),
        parse: (json) => resolveCitationsResponseSchema.parse(json),
      }),
  }
}
