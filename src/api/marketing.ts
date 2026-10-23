import {
  type CreateDemoRequestRequest,
  type CreateDemoRequestResponse,
  createDemoRequestResponseSchema,
  IDEMPOTENCY_KEY_HEADER,
} from 'tula-closeline-contract'
import type { HttpClient } from '~/api/http'

/** The public marketing route the portal uses: nobody is signed in, so no token is sent. */
export type MarketingApi = {
  /** Submits a Demo Request; the key makes a repeat of the same request store it once. */
  createDemoRequest(
    body: CreateDemoRequestRequest,
    idempotencyKey: string
  ): Promise<CreateDemoRequestResponse>
}

/** Builds the marketing route over an HTTP client for same-origin paths. */
export function createMarketingApi(http: HttpClient): MarketingApi {
  return {
    createDemoRequest: (body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: '/v1/marketing/demo-requests',
        body,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        parse: (json) => createDemoRequestResponseSchema.parse(json),
      }),
  }
}
