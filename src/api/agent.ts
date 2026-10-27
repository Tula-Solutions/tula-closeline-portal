import {
  type AgentKind,
  agentControlSchema,
  agentsPausedSchema,
  IDEMPOTENCY_KEY_HEADER,
  instructionDiffSchema,
  instructionVersionSchema,
  listAgentControlsResponseSchema,
  listInstructionVersionsResponseSchema,
  publishedInstructionsSchema,
  saveInstructionVersionRequestSchema,
  setAgentControlRequestSchema,
  setAgentsPausedRequestSchema,
} from 'tula-closeline-contract'
import type { z } from 'zod'
import { PAGE_SIZE, type PageRequest } from '~/api/core'
import type { HttpClient } from '~/api/http'

/** One saved version of an Agent's instructions, with its text. */
export type InstructionVersion = z.infer<typeof instructionVersionSchema>

/** One row of the versions ledger: everything but the text. */
export type InstructionSummary = z.infer<
  typeof listInstructionVersionsResponseSchema
>['items'][number]

/** One page of versions, newest first. */
export type InstructionVersionsPage = z.infer<typeof listInstructionVersionsResponseSchema>

/** The published instructions of an Agent kind; `version` is null when none is published. */
export type PublishedInstructions = z.infer<typeof publishedInstructionsSchema>

/** A line-by-line comparison of two versions. */
export type InstructionDiff = z.infer<typeof instructionDiffSchema>

/** The control settings of one Agent kind on one channel (or its default, `channel: null`). */
export type AgentControl = z.infer<typeof agentControlSchema>

/** What setting a control sends. */
export type AgentControlRequest = z.infer<typeof setAgentControlRequestSchema>

/** Whether every Agent of the Organization is paused. */
export type AgentsPaused = z.infer<typeof agentsPausedSchema>

/** The channel segment of a control: a channel, or `default` for the kind's fallback. */
export type ControlChannelParam = NonNullable<AgentControl['channel']> | 'default'

/** The core routes the portal uses for Agent instructions, control levels and the pause switch. */
export type AgentApi = {
  /** The published instructions of a kind (Owner, Admin, Manager). */
  getPublished(kind: AgentKind, signal?: AbortSignal): Promise<PublishedInstructions>
  /** One page of versions, newest first (Owner, Admin, Manager). */
  listVersions(kind: AgentKind, page: PageRequest): Promise<InstructionVersionsPage>
  /** Saves `text` as a new draft version; the key makes a repeat save one (Owner, Admin). */
  saveVersion(kind: AgentKind, text: string, idempotencyKey: string): Promise<InstructionVersion>
  /** Publishes a version, which is a rollback when it is an earlier one (Owner, Admin). */
  publishVersion(
    kind: AgentKind,
    number: number,
    idempotencyKey: string
  ): Promise<InstructionVersion>
  /** Compares two versions line by line. */
  getDiff(kind: AgentKind, from: number, to: number, signal?: AbortSignal): Promise<InstructionDiff>
  /** The controls of a kind: its default and its channel overrides, one page (at most 100). */
  listControls(kind: AgentKind, signal?: AbortSignal): Promise<AgentControl[]>
  /** Replaces the controls of a kind on one channel (Owner, Admin). */
  setControl(
    kind: AgentKind,
    channel: ControlChannelParam,
    body: AgentControlRequest,
    idempotencyKey: string
  ): Promise<AgentControl>
  /** Whether every Agent is paused. */
  getPause(signal?: AbortSignal): Promise<AgentsPaused>
  /** Pauses or resumes every Agent at once (Owner, Admin). */
  setPause(paused: boolean, idempotencyKey: string): Promise<AgentsPaused>
}

const segment = encodeURIComponent

/** Builds the Agent routes over an HTTP client for same-origin paths, which sends the access token. */
export function createAgentApi(http: HttpClient): AgentApi {
  const base = (kind: AgentKind) => `/v1/agent-instructions/${segment(kind)}`
  return {
    getPublished: (kind, signal) =>
      http.request({
        path: `${base(kind)}/published`,
        auth: true,
        signal,
        parse: (json) => publishedInstructionsSchema.parse(json),
      }),
    listVersions: (kind, page) =>
      http.request({
        path: `${base(kind)}/versions`,
        query: { cursor: page.cursor, limit: page.limit ?? PAGE_SIZE },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => listInstructionVersionsResponseSchema.parse(json),
      }),
    saveVersion: (kind, text, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: `${base(kind)}/versions`,
        body: saveInstructionVersionRequestSchema.parse({ text }),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => instructionVersionSchema.parse(json),
      }),
    publishVersion: (kind, number, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: `${base(kind)}/versions/${number}/publish`,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => instructionVersionSchema.parse(json),
      }),
    getDiff: (kind, from, to, signal) =>
      http.request({
        path: `${base(kind)}/diff`,
        query: { from, to },
        auth: true,
        signal,
        parse: (json) => instructionDiffSchema.parse(json),
      }),
    listControls: (kind, signal) =>
      http.request({
        path: '/v1/agent-controls',
        query: { agentKind: kind, limit: 100 },
        auth: true,
        signal,
        parse: (json) => listAgentControlsResponseSchema.parse(json).items,
      }),
    setControl: (kind, channel, body, idempotencyKey) =>
      http.request({
        method: 'PUT',
        path: `/v1/agent-controls/${segment(kind)}/${segment(channel)}`,
        body: setAgentControlRequestSchema.parse(body),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => agentControlSchema.parse(json),
      }),
    getPause: (signal) =>
      http.request({
        path: '/v1/agent-controls/organization-pause',
        auth: true,
        signal,
        parse: (json) => agentsPausedSchema.parse(json),
      }),
    setPause: (paused, idempotencyKey) =>
      http.request({
        method: 'PUT',
        path: '/v1/agent-controls/organization-pause',
        body: setAgentsPausedRequestSchema.parse({ paused }),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => agentsPausedSchema.parse(json),
      }),
  }
}
