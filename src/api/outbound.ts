import {
  type CompleteMailboxConnectRequest,
  type DomainCheck,
  domainCheckSchema,
  IDEMPOTENCY_KEY_HEADER,
  type Mailbox,
  type MailboxConnectStart,
  type MailboxHealth,
  type MailboxLimits,
  type MailboxProvider,
  mailboxConnectStartSchema,
  mailboxHealthSchema,
  mailboxPageSchema,
  mailboxSchema,
  type OrganizationMailLimits,
  organizationMailLimitsSchema,
  type SendRecord,
  type SendRefusalReason,
  type SendState,
  sendPageSchema,
  setMailboxLimitsRequestSchema,
} from 'tula-closeline-contract'
import { PAGE_SIZE, type PageRequest } from '~/api/core'
import type { HttpClient } from '~/api/http'

/** One page of Mailboxes, newest connection first. */
export type MailboxesPage = {
  readonly items: readonly Mailbox[]
  readonly nextCursor: string | null
}

/** One page of send records, newest decision first. */
export type SendsPage = {
  readonly items: readonly SendRecord[]
  readonly nextCursor: string | null
}

/** What a page of sends may be narrowed by; each is sent only when set. */
export type SendFilter = {
  readonly campaignId?: string | undefined
  readonly prospectId?: string | undefined
  readonly mailboxId?: string | undefined
  readonly state?: SendState | undefined
  readonly reason?: SendRefusalReason | undefined
}

/** The outbound service routes the portal uses (Mailboxes and the send log). */
export type OutboundApi = {
  /** One page of the Mailboxes the caller may see. */
  listMailboxes(page: PageRequest): Promise<MailboxesPage>
  /** Starts connecting a Mailbox and returns the provider's consent address. */
  startConnect(
    provider: MailboxProvider,
    kind: 'personal' | 'shared',
    idempotencyKey: string
  ): Promise<MailboxConnectStart>
  /** Finishes connecting with the one-time code and `state` from the provider's return. */
  completeConnect(body: CompleteMailboxConnectRequest, idempotencyKey: string): Promise<Mailbox>
  /** Disconnects a Mailbox and drops its access. */
  disconnect(mailboxId: string, idempotencyKey: string): Promise<void>
  /** Replaces a Mailbox's limits; the service refuses any above the Organization ceiling. */
  setLimits(mailboxId: string, limits: MailboxLimits): Promise<Mailbox>
  /** Pauses sending from a Mailbox. */
  pause(mailboxId: string): Promise<Mailbox>
  /** Resumes a paused Mailbox. */
  resume(mailboxId: string): Promise<Mailbox>
  /** The health score of a Mailbox and what each part contributes. */
  getHealth(mailboxId: string, signal?: AbortSignal): Promise<MailboxHealth>
  /** The last SPF, DKIM and DMARC check of the Mailbox's domain. */
  getDomainCheck(mailboxId: string, signal?: AbortSignal): Promise<DomainCheck>
  /** Checks the Mailbox's domain now (Owner, Admin). */
  checkDomain(mailboxId: string, idempotencyKey: string): Promise<DomainCheck>
  /** The Organization's ceilings that no Mailbox limit may pass. */
  getOrganizationLimits(signal?: AbortSignal): Promise<OrganizationMailLimits>
  /** One page of send records, with the reason each refused or deferred one was held back. */
  listSends(page: PageRequest, filter: SendFilter): Promise<SendsPage>
}

const segment = encodeURIComponent

/** Builds the outbound routes over an HTTP client for same-origin paths, which sends the access token. */
export function createOutboundApi(http: HttpClient): OutboundApi {
  const key = (idempotencyKey: string) => ({ [IDEMPOTENCY_KEY_HEADER]: idempotencyKey })
  const one = (path: string, method: 'POST' | 'PUT', body?: unknown) =>
    http.request({
      method,
      path,
      ...(body === undefined ? {} : { body }),
      auth: true,
      parse: (json) => mailboxSchema.parse(json),
    })
  return {
    listMailboxes: (page) =>
      http.request({
        path: '/v1/mailboxes',
        query: { cursor: page.cursor, limit: page.limit ?? PAGE_SIZE },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => mailboxPageSchema.parse(json),
      }),
    startConnect: (provider, kind, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: '/v1/mailboxes/connect',
        body: { provider, kind, teamIds: [] },
        headers: key(idempotencyKey),
        auth: true,
        parse: (json) => mailboxConnectStartSchema.parse(json),
      }),
    completeConnect: (body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: '/v1/mailboxes/connect/complete',
        body,
        headers: key(idempotencyKey),
        auth: true,
        parse: (json) => mailboxSchema.parse(json),
      }),
    disconnect: (mailboxId, idempotencyKey) =>
      http.request({
        method: 'DELETE',
        path: `/v1/mailboxes/${segment(mailboxId)}`,
        headers: key(idempotencyKey),
        auth: true,
        parse: () => undefined,
      }),
    setLimits: (mailboxId, limits) =>
      one(
        `/v1/mailboxes/${segment(mailboxId)}/limits`,
        'PUT',
        setMailboxLimitsRequestSchema.parse(limits)
      ),
    pause: (mailboxId) => one(`/v1/mailboxes/${segment(mailboxId)}/pause`, 'POST'),
    resume: (mailboxId) => one(`/v1/mailboxes/${segment(mailboxId)}/resume`, 'POST'),
    getHealth: (mailboxId, signal) =>
      http.request({
        path: `/v1/mailboxes/${segment(mailboxId)}/health`,
        auth: true,
        signal,
        parse: (json) => mailboxHealthSchema.parse(json),
      }),
    getDomainCheck: (mailboxId, signal) =>
      http.request({
        path: `/v1/mailboxes/${segment(mailboxId)}/domain-check`,
        auth: true,
        signal,
        parse: (json) => domainCheckSchema.parse(json),
      }),
    checkDomain: (mailboxId, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: `/v1/mailboxes/${segment(mailboxId)}/domain-check`,
        headers: key(idempotencyKey),
        auth: true,
        parse: (json) => domainCheckSchema.parse(json),
      }),
    getOrganizationLimits: (signal) =>
      http.request({
        path: '/v1/mail/limits',
        auth: true,
        signal,
        parse: (json) => organizationMailLimitsSchema.parse(json),
      }),
    listSends: (page, filter) =>
      http.request({
        path: '/v1/mail/sends',
        query: {
          cursor: page.cursor,
          limit: page.limit ?? PAGE_SIZE,
          campaignId: filter.campaignId,
          prospectId: filter.prospectId,
          mailboxId: filter.mailboxId,
          state: filter.state,
          reason: filter.reason,
        },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => sendPageSchema.parse(json),
      }),
  }
}
