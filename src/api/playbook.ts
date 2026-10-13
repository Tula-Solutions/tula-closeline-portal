import {
  type DocumentState,
  documentSchema,
  IDEMPOTENCY_KEY_HEADER,
  type ListDocumentsResponse,
  listDocumentsResponseSchema,
  type PlaybookDocument,
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

/** The playbook service routes the portal uses. */
export type PlaybookApi = {
  /** One page of documents, newest first; without a state, every document that is not deleted. */
  listDocuments(page: DocumentPageRequest): Promise<ListDocumentsResponse>
  /** Uploads one file (Owner, Admin); the key makes a repeat of the same upload store it once. */
  uploadDocument(file: File, idempotencyKey: string, signal?: AbortSignal): Promise<UploadResult>
  /** Soft-deletes a document (Owner, Admin); it can be restored until its purge time. */
  deleteDocument(documentId: string): Promise<PlaybookDocument>
  /** Restores a soft-deleted document (Owner, Admin). */
  restoreDocument(documentId: string): Promise<PlaybookDocument>
}

const segment = encodeURIComponent

/** Builds the playbook routes over an HTTP client for same-origin paths, which sends the access token. */
export function createPlaybookApi(http: HttpClient): PlaybookApi {
  return {
    listDocuments: (page) =>
      http.request({
        path: '/v1/playbook/documents',
        query: { cursor: page.cursor, limit: PAGE_SIZE, state: page.state },
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
          duplicate: status === 200,
        }),
      })
    },
    deleteDocument: (documentId) =>
      http.request({
        method: 'DELETE',
        path: `/v1/playbook/documents/${segment(documentId)}`,
        auth: true,
        parse: (json) => documentSchema.parse(json),
      }),
    restoreDocument: (documentId) =>
      http.request({
        method: 'POST',
        path: `/v1/playbook/documents/${segment(documentId)}/restore`,
        auth: true,
        parse: (json) => documentSchema.parse(json),
      }),
  }
}
