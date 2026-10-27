import {
  type AddLineRequest,
  type AgentSettings,
  type AssignLineRequest,
  agentSettingsSchema,
  type CreateQualificationQuestionRequest,
  IDEMPOTENCY_KEY_HEADER,
  type Line,
  linePageSchema,
  lineSchema,
  type QualificationQuestion,
  qualificationQuestionPageSchema,
  qualificationQuestionSchema,
  reorderQualificationQuestionsRequestSchema,
  type SetAgentSettingsRequest,
  setAgentSettingsRequestSchema,
  type UpdateQualificationQuestionRequest,
} from 'tula-closeline-contract'
import { PAGE_SIZE, type PageRequest } from '~/api/core'
import type { HttpClient } from '~/api/http'

/** One page of Lines, newest first. */
export type LinesPage = { readonly items: readonly Line[]; readonly nextCursor: string | null }

/** The voice service routes the portal uses (the Lines admin). */
export type VoiceApi = {
  /** One page of the Organization's Lines (Owner, Admin); released ones are listed too. */
  listLines(page: PageRequest): Promise<LinesPage>
  /** Buys or ports a Line; the key makes a repeat of the same request add one number. */
  addLine(body: AddLineRequest, idempotencyKey: string): Promise<Line>
  /** Sets who inbound Calls on a Line ring: a Team, a Rep or nobody. */
  assignLine(lineId: string, assignment: AssignLineRequest): Promise<Line>
  /** Gives a Line up; it cannot be changed afterwards. */
  releaseLine(lineId: string): Promise<Line>
  /** The Inbound Agent settings (Owner, Admin, Manager). */
  getSettings(signal?: AbortSignal): Promise<AgentSettings>
  /** Replaces the Inbound Agent settings; the key makes a repeat change nothing (Owner, Admin). */
  setSettings(body: SetAgentSettingsRequest, idempotencyKey: string): Promise<AgentSettings>
  /** The Qualification questions in the order the Agent asks them: one page of at most 100, which holds all 50 an Organization may keep. */
  listQuestions(signal?: AbortSignal): Promise<readonly QualificationQuestion[]>
  /** Adds a question, last unless the body says otherwise; the key makes a repeat add one (Owner, Admin). */
  createQuestion(
    body: CreateQualificationQuestionRequest,
    idempotencyKey: string
  ): Promise<QualificationQuestion>
  /** Replaces a question's content; its place changes by reorder (Owner, Admin). */
  updateQuestion(
    questionId: string,
    body: UpdateQualificationQuestionRequest
  ): Promise<QualificationQuestion>
  /** Removes a question (Owner, Admin). */
  deleteQuestion(questionId: string): Promise<void>
  /** Sets the order of all questions, every id once; the key makes a repeat change nothing (Owner, Admin). */
  reorderQuestions(questionIds: readonly string[], idempotencyKey: string): Promise<void>
}

const segment = encodeURIComponent

/** Builds the voice routes over an HTTP client for same-origin paths, which sends the access token. */
export function createVoiceApi(http: HttpClient): VoiceApi {
  return {
    listLines: (page) =>
      http.request({
        path: '/v1/lines',
        query: { cursor: page.cursor, limit: page.limit ?? PAGE_SIZE },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => linePageSchema.parse(json),
      }),
    addLine: (body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: '/v1/lines',
        body,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => lineSchema.parse(json),
      }),
    assignLine: (lineId, assignment) =>
      http.request({
        method: 'PUT',
        path: `/v1/lines/${segment(lineId)}/assignment`,
        body: assignment,
        auth: true,
        parse: (json) => lineSchema.parse(json),
      }),
    releaseLine: (lineId) =>
      http.request({
        method: 'POST',
        path: `/v1/lines/${segment(lineId)}/release`,
        auth: true,
        parse: (json) => lineSchema.parse(json),
      }),
    getSettings: (signal) =>
      http.request({
        path: '/v1/agent/settings',
        auth: true,
        signal,
        parse: (json) => agentSettingsSchema.parse(json),
      }),
    setSettings: (body, idempotencyKey) =>
      http.request({
        method: 'PUT',
        path: '/v1/agent/settings',
        body: setAgentSettingsRequestSchema.parse(body),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => agentSettingsSchema.parse(json),
      }),
    listQuestions: (signal) =>
      http.request({
        path: '/v1/agent/questions',
        query: { limit: 100 },
        auth: true,
        signal,
        parse: (json) => qualificationQuestionPageSchema.parse(json).items,
      }),
    createQuestion: (body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: '/v1/agent/questions',
        body,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => qualificationQuestionSchema.parse(json),
      }),
    updateQuestion: (questionId, body) =>
      http.request({
        method: 'PATCH',
        path: `/v1/agent/questions/${segment(questionId)}`,
        body,
        auth: true,
        parse: (json) => qualificationQuestionSchema.parse(json),
      }),
    deleteQuestion: (questionId) =>
      http.request<void>({
        method: 'DELETE',
        path: `/v1/agent/questions/${segment(questionId)}`,
        auth: true,
      }),
    reorderQuestions: (questionIds, idempotencyKey) =>
      http.request({
        method: 'PUT',
        path: '/v1/agent/question-order',
        body: reorderQualificationQuestionsRequestSchema.parse({ questionIds }),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        // The contract names no body for this answer; the list is read again after it.
        parse: () => undefined,
      }),
  }
}
