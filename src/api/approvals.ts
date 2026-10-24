import {
  type ApprovalPolicy,
  type ApprovalQueueItem,
  type ApprovalRule,
  type ApproveDraftRequest,
  approvalPoliciesSchema,
  approvalPolicySchema,
  approvalQueuePageSchema,
  type Decision,
  type Draft,
  decisionPageSchema,
  draftSchema,
  draftSourcesSchema,
  IDEMPOTENCY_KEY_HEADER,
  type InboxChannel,
  type SourcePassage,
} from 'tula-closeline-contract'
import { PAGE_SIZE, type PageRequest } from '~/api/core'
import type { HttpClient } from '~/api/http'

/** The passages a Draft cites. */
export type DraftSources = { readonly items: readonly SourcePassage[] }

/** The approval policy of each channel. */
export type ApprovalPolicies = { readonly items: readonly ApprovalPolicy[] }

/** What rejecting a Draft sends: an optional note. */
export type RejectDraftRequest = { readonly note?: string }

/** One page of the approval queue, oldest first. */
export type ApprovalQueuePage = {
  readonly items: readonly ApprovalQueueItem[]
  readonly nextCursor: string | null
}

/** One page of decisions, newest first. */
export type DecisionsPage = {
  readonly items: readonly Decision[]
  readonly nextCursor: string | null
}

/** What the approval queue may be narrowed by; each is sent only when set. */
export type ApprovalFilter = {
  readonly channel?: InboxChannel | undefined
  readonly conversationId?: string | undefined
}

/** The core routes the portal uses to review Drafts and set approval policy. */
export type ApprovalsApi = {
  /** One page of Drafts waiting for a decision, oldest first, each with whether the caller may decide it. */
  listApprovals(page: PageRequest & ApprovalFilter): Promise<ApprovalQueuePage>
  /** One Draft. */
  getDraft(draftId: string, signal?: AbortSignal): Promise<Draft>
  /** The passages a Draft cites; may fail while the Draft stays readable. */
  getDraftSources(draftId: string, signal?: AbortSignal): Promise<DraftSources>
  /** Approves a Draft as written, or with `body` as edited; the key makes a repeat decide once. */
  approveDraft(draftId: string, body: ApproveDraftRequest, idempotencyKey: string): Promise<Draft>
  /** Rejects a Draft with an optional note; the key makes a repeat decide once. */
  rejectDraft(draftId: string, body: RejectDraftRequest, idempotencyKey: string): Promise<Draft>
  /** One page of decisions about a Draft (Owner, Admin, Manager). */
  listDecisions(draftId: string, page: PageRequest): Promise<DecisionsPage>
  /** The approval policy of each channel (Owner, Admin). */
  listPolicies(signal?: AbortSignal): Promise<ApprovalPolicies>
  /** Sets the rule of one channel; it is idempotent. */
  setPolicy(channel: InboxChannel, rule: ApprovalRule): Promise<ApprovalPolicy>
}

const segment = encodeURIComponent

/** Builds the approval routes over an HTTP client for same-origin paths, which sends the access token. */
export function createApprovalsApi(http: HttpClient): ApprovalsApi {
  return {
    listApprovals: (page) =>
      http.request({
        path: '/v1/approvals',
        query: {
          cursor: page.cursor,
          limit: page.limit ?? PAGE_SIZE,
          channel: page.channel,
          conversationId: page.conversationId,
        },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => approvalQueuePageSchema.parse(json),
      }),
    getDraft: (draftId, signal) =>
      http.request({
        path: `/v1/drafts/${segment(draftId)}`,
        auth: true,
        ...(signal ? { signal } : {}),
        parse: (json) => draftSchema.parse(json),
      }),
    getDraftSources: (draftId, signal) =>
      http.request({
        path: `/v1/drafts/${segment(draftId)}/sources`,
        auth: true,
        ...(signal ? { signal } : {}),
        parse: (json) => draftSourcesSchema.parse(json),
      }),
    approveDraft: (draftId, body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: `/v1/drafts/${segment(draftId)}/approve`,
        body,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => draftSchema.parse(json),
      }),
    rejectDraft: (draftId, body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: `/v1/drafts/${segment(draftId)}/reject`,
        body,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => draftSchema.parse(json),
      }),
    listDecisions: (draftId, page) =>
      http.request({
        path: '/v1/decisions',
        query: { cursor: page.cursor, limit: page.limit ?? PAGE_SIZE, draftId },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => decisionPageSchema.parse(json),
      }),
    listPolicies: (signal) =>
      http.request({
        path: '/v1/approval-policies',
        auth: true,
        ...(signal ? { signal } : {}),
        parse: (json) => approvalPoliciesSchema.parse(json),
      }),
    setPolicy: (channel, rule) =>
      http.request({
        method: 'PUT',
        path: `/v1/approval-policies/${segment(channel)}`,
        body: { rule },
        auth: true,
        parse: (json) => approvalPolicySchema.parse(json),
      }),
  }
}
