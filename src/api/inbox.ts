import {
  type Conversation,
  type ConversationController,
  type ConversationState,
  conversationPageSchema,
  conversationSchema,
  type Draft,
  draftSchema,
  IDEMPOTENCY_KEY_HEADER,
  type InboxChannel,
  type Message,
  messagePageSchema,
  type ReplyLabel,
} from 'tula-closeline-contract'
import { PAGE_SIZE, type PageRequest } from '~/api/core'
import type { HttpClient } from '~/api/http'

/** One page of Conversations, latest activity first. */
export type ConversationsPage = {
  readonly items: readonly Conversation[]
  readonly nextCursor: string | null
}

/** One page of Messages, oldest first. */
export type MessagesPage = {
  readonly items: readonly Message[]
  readonly nextCursor: string | null
}

/** What a page of Conversations may be narrowed by; each is sent only when set. Core still decides what the caller may see. */
export type ConversationFilter = {
  readonly channel?: InboxChannel | undefined
  readonly state?: ConversationState | undefined
  readonly controller?: ConversationController | undefined
  readonly label?: ReplyLabel | undefined
}

/** The core routes the portal uses to read the inbox (any role; core limits a Rep to their own). */
export type InboxApi = {
  /** One page of Conversations the caller may see. */
  listConversations(page: PageRequest & ConversationFilter): Promise<ConversationsPage>
  /** One Conversation; one the caller may not see is `inbox.conversation_not_found`. */
  getConversation(conversationId: string, signal?: AbortSignal): Promise<Conversation>
  /** One page of a Conversation's Messages, oldest first. */
  listMessages(conversationId: string, page: PageRequest): Promise<MessagesPage>
  /** Takes the Conversation over from the Agent; the same Rep again is a no-op that answers the Conversation. The key makes a repeat act once. */
  takeOver(conversationId: string, idempotencyKey: string): Promise<Conversation>
  /** Hands the Conversation back to the Agent (the Rep who took it over, an Admin or an Owner). The key makes a repeat act once. */
  handBack(conversationId: string, idempotencyKey: string): Promise<Conversation>
  /** Sends the controlling Rep's own reply; core answers the approved Draft while the channel sends it. The key makes a repeat send once. */
  reply(conversationId: string, body: string, idempotencyKey: string): Promise<Draft>
}

const segment = encodeURIComponent

/** Builds the inbox read routes over an HTTP client for same-origin paths, which sends the access token. */
export function createInboxApi(http: HttpClient): InboxApi {
  return {
    listConversations: (page) =>
      http.request({
        path: '/v1/conversations',
        query: {
          cursor: page.cursor,
          limit: page.limit ?? PAGE_SIZE,
          channel: page.channel,
          state: page.state,
          controller: page.controller,
          label: page.label,
        },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => conversationPageSchema.parse(json),
      }),
    getConversation: (conversationId, signal) =>
      http.request({
        path: `/v1/conversations/${segment(conversationId)}`,
        auth: true,
        ...(signal ? { signal } : {}),
        parse: (json) => conversationSchema.parse(json),
      }),
    listMessages: (conversationId, page) =>
      http.request({
        path: `/v1/conversations/${segment(conversationId)}/messages`,
        query: { cursor: page.cursor, limit: page.limit ?? PAGE_SIZE },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => messagePageSchema.parse(json),
      }),
    takeOver: (conversationId, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: `/v1/conversations/${segment(conversationId)}/takeover`,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => conversationSchema.parse(json),
      }),
    handBack: (conversationId, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: `/v1/conversations/${segment(conversationId)}/handback`,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => conversationSchema.parse(json),
      }),
    reply: (conversationId, body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: `/v1/conversations/${segment(conversationId)}/replies`,
        body: { body },
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => draftSchema.parse(json),
      }),
  }
}
