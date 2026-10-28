import {
  type ConsentForm,
  type CreateConsentFormRequest,
  consentFormPageSchema,
  consentFormSchema,
  createConsentFormRequestSchema,
  type HostedConsentFormView,
  type HostedConsentReceipt,
  type HostedConsentSubmission,
  hostedConsentFormViewSchema,
  hostedConsentReceiptSchema,
  hostedConsentSubmissionSchema,
  IDEMPOTENCY_KEY_HEADER,
} from 'tula-closeline-contract'
import type { z } from 'zod'
import { PAGE_SIZE, type PageRequest } from '~/api/core'
import type { HttpClient } from '~/api/http'

/** One page of hosted consent forms, newest first. */
export type ConsentFormsPage = z.infer<typeof consentFormPageSchema>

/** The hosted consent form routes of core that Owners and Admins use. */
export type ConsentFormsApi = {
  /** One page of forms, newest first. */
  list(page: PageRequest): Promise<ConsentFormsPage>
  /** Creates a draft form from a wording; the key makes a repeat create one. */
  create(body: CreateConsentFormRequest, idempotencyKey: string): Promise<ConsentForm>
  /** Publishes a draft: it gets its link and its wording locks. */
  publish(formId: string): Promise<ConsentForm>
  /** Closes a published form: its link stops working and the consent already recorded stays. */
  close(formId: string): Promise<ConsentForm>
}

/** The public routes of the hosted consent page: no sign-in, only the signed token from the link. */
export type HostedConsentApi = {
  /** Reads the Organization's name, the exact wording and the channels offered; changes nothing. */
  view(token: string, signal?: AbortSignal): Promise<HostedConsentFormView>
  /** Records one grant per agreed channel; a replay of the same key answers the first receipt. */
  submit(
    token: string,
    body: HostedConsentSubmission,
    idempotencyKey: string
  ): Promise<HostedConsentReceipt>
}

const segment = encodeURIComponent

/** Builds the admin form routes over an HTTP client for same-origin paths, which sends the access token. */
export function createConsentFormsApi(http: HttpClient): ConsentFormsApi {
  const act = (formId: string, action: 'publication' | 'closure') =>
    http.request({
      method: 'POST',
      path: `/v1/consent-forms/${segment(formId)}/${action}`,
      auth: true,
      parse: (json) => consentFormSchema.parse(json),
    })
  return {
    list: (page) =>
      http.request({
        path: '/v1/consent-forms',
        query: { cursor: page.cursor, limit: page.limit ?? PAGE_SIZE },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => consentFormPageSchema.parse(json),
      }),
    create: (body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: '/v1/consent-forms',
        body: createConsentFormRequestSchema.parse(body),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => consentFormSchema.parse(json),
      }),
    publish: (formId) => act(formId, 'publication'),
    close: (formId) => act(formId, 'closure'),
  }
}

/** Builds the public hosted-page routes; they send no access token. */
export function createHostedConsentApi(http: HttpClient): HostedConsentApi {
  const base = (token: string) => `/v1/public/consent-forms/${segment(token)}`
  return {
    view: (token, signal) =>
      http.request({
        path: base(token),
        ...(signal ? { signal } : {}),
        parse: (json) => hostedConsentFormViewSchema.parse(json),
      }),
    submit: (token, body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: `${base(token)}/submissions`,
        body: hostedConsentSubmissionSchema.parse(body),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        parse: (json) => hostedConsentReceiptSchema.parse(json),
      }),
  }
}
