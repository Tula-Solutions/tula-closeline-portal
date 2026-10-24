import {
  type ApiKey,
  apiKeySchema,
  type CreateApiKeyRequest,
  type CreateApiKeyResponse,
  createApiKeyResponseSchema,
  IDEMPOTENCY_KEY_HEADER,
  listApiKeysResponseSchema,
} from 'tula-closeline-contract'
import { PAGE_SIZE, type PageRequest } from '~/api/core'
import type { HttpClient } from '~/api/http'

/** One page of API keys, newest first. */
export type ApiKeysPage = { readonly items: readonly ApiKey[]; readonly nextCursor: string | null }

/** The core routes the portal uses for API keys (Owner, Admin). */
export type ApiKeysApi = {
  /** One page of the Organization's API keys; revoked ones are listed too. The secret is never in a list. */
  listApiKeys(page: PageRequest): Promise<ApiKeysPage>
  /** Creates a key; the secret is in this answer only, and a repeat of the same request answers without it. */
  createApiKey(body: CreateApiKeyRequest, idempotencyKey: string): Promise<CreateApiKeyResponse>
  /** Revokes a key; a repeat with the same key answers the same. */
  revokeApiKey(apiKeyId: string, idempotencyKey: string): Promise<ApiKey>
}

const segment = encodeURIComponent

/** Builds the API key routes over an HTTP client for same-origin paths, which sends the access token. */
export function createApiKeysApi(http: HttpClient): ApiKeysApi {
  return {
    listApiKeys: (page) =>
      http.request({
        path: '/v1/api-keys',
        query: { cursor: page.cursor, limit: page.limit ?? PAGE_SIZE, includeRevoked: 'true' },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => listApiKeysResponseSchema.parse(json),
      }),
    createApiKey: (body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: '/v1/api-keys',
        body,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => createApiKeyResponseSchema.parse(json),
      }),
    revokeApiKey: (apiKeyId, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: `/v1/api-keys/${segment(apiKeyId)}/revoke`,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => apiKeySchema.parse(json),
      }),
  }
}
