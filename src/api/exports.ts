import {
  type CreateExportRequest,
  type ExportDownload,
  type ExportJob,
  exportDownloadSchema,
  exportJobSchema,
  IDEMPOTENCY_KEY_HEADER,
  listExportsResponseSchema,
} from 'tula-closeline-contract'
import { PAGE_SIZE, type PageRequest } from '~/api/core'
import type { HttpClient } from '~/api/http'

/** One page of export jobs, newest first. */
export type ExportsPage = {
  readonly items: readonly ExportJob[]
  readonly nextCursor: string | null
}

/** The core routes the portal uses for the Organization data export (Owner, Admin). */
export type ExportsApi = {
  /** One page of the Organization's export jobs. No job carries a download address. */
  listExports(page: PageRequest): Promise<ExportsPage>
  /** One job, for watching its state. */
  getExport(exportId: string, signal?: AbortSignal): Promise<ExportJob>
  /** Asks for an export; a repeat with the same key answers the same job. */
  requestExport(body: CreateExportRequest, idempotencyKey: string): Promise<ExportJob>
  /** A fresh download link for a ready export, valid for a day. The address is never stored or logged. */
  createDownloadLink(exportId: string, idempotencyKey: string): Promise<ExportDownload>
}

const segment = encodeURIComponent

/** Builds the export routes over an HTTP client for same-origin paths, which sends the access token. */
export function createExportsApi(http: HttpClient): ExportsApi {
  return {
    listExports: (page) =>
      http.request({
        path: '/v1/exports',
        query: { cursor: page.cursor, limit: page.limit ?? PAGE_SIZE },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => listExportsResponseSchema.parse(json),
      }),
    getExport: (exportId, signal) =>
      http.request({
        path: `/v1/exports/${segment(exportId)}`,
        auth: true,
        ...(signal ? { signal } : {}),
        parse: (json) => exportJobSchema.parse(json),
      }),
    requestExport: (body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: '/v1/exports',
        body,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => exportJobSchema.parse(json),
      }),
    createDownloadLink: (exportId, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: `/v1/exports/${segment(exportId)}/download-links`,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => exportDownloadSchema.parse(json),
      }),
  }
}
