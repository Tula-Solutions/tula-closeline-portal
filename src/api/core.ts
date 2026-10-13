import { type Organization, organizationSchema } from 'tula-closeline-contract'
import type { HttpClient } from '~/api/http'

/** The core service routes the portal uses. */
export type CoreApi = {
  /** Reads the caller's Organization (a read, so it is retried). */
  getOrganization(signal?: AbortSignal): Promise<Organization>
}

/** Builds the core routes over an HTTP client whose base URL is the core service and which sends the access token. */
export function createCoreApi(http: HttpClient): CoreApi {
  return {
    getOrganization: (signal) =>
      http.request<Organization>({
        path: '/v1/organization',
        auth: true,
        signal,
        parse: (json) => organizationSchema.parse(json),
      }),
  }
}
