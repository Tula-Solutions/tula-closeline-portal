import {
  type AddLineRequest,
  type AgentSettings,
  type AgentTurn,
  type AssignLineRequest,
  agentSettingsSchema,
  type CreateQualificationQuestionRequest,
  type Handoff,
  type HandoffContext,
  handoffContextSchema,
  handoffPageSchema,
  handoffSchema,
  IDEMPOTENCY_KEY_HEADER,
  type Line,
  linePageSchema,
  lineSchema,
  type QualificationQuestion,
  qualificationQuestionPageSchema,
  qualificationQuestionSchema,
  reorderQualificationQuestionsRequestSchema,
  type SetAgentSettingsRequest,
  sendTryMessageRequestSchema,
  setAgentSettingsRequestSchema,
  startTrySessionRequestSchema,
  type TrySession,
  tryReplySchema,
  trySessionSchema,
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
  /** Starts a text rehearsal of the Inbound Agent; nothing is placed or sent (Owner, Admin). */
  startTrySession(idempotencyKey: string): Promise<TrySession>
  /** Says something in a try-it session and returns the Agent's reply turn (Owner, Admin). */
  sendTryMessage(sessionId: string, text: string, idempotencyKey: string): Promise<AgentTurn>
  /** The Handoffs offered to the caller that still wait for an answer (one small page, latest first). */
  listPendingHandoffs(signal?: AbortSignal): Promise<readonly Handoff[]>
  /** What the Rep sees before answering a Handoff: the Prospect, the Qualification so far and the last turns. */
  getHandoffContext(handoffId: string, signal?: AbortSignal): Promise<HandoffContext>
  /** Accepts or declines a Handoff offered to the caller; the Disclosure plays, then the Rep is bridged. */
  answerHandoff(handoffId: string, answer: 'accept' | 'decline'): Promise<Handoff>
}

const segment = encodeURIComponent

/** A text turn asks a model and the Playbook; no budget is stated in the spec, so allow 30 s before the portal gives up (the key makes a retry safe). */
const TRY_TURN_TIMEOUT_MS = 30_000

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
    startTrySession: (idempotencyKey) =>
      http.request({
        method: 'POST',
        path: '/v1/agent/try-sessions',
        body: startTrySessionRequestSchema.parse({}),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => trySessionSchema.parse(json),
      }),
    sendTryMessage: (sessionId, text, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: `/v1/agent/try-sessions/${segment(sessionId)}/messages`,
        body: sendTryMessageRequestSchema.parse({ text }),
        timeoutMs: TRY_TURN_TIMEOUT_MS,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => tryReplySchema.parse(json).reply,
      }),
    listPendingHandoffs: (signal) =>
      http.request({
        path: '/v1/handoffs',
        query: { state: 'pending', limit: 5 },
        auth: true,
        signal,
        parse: (json) => handoffPageSchema.parse(json).items,
      }),
    getHandoffContext: (handoffId, signal) =>
      http.request({
        path: `/v1/handoffs/${segment(handoffId)}`,
        auth: true,
        signal,
        parse: (json) => handoffContextSchema.parse(json),
      }),
    answerHandoff: (handoffId, answer) =>
      http.request({
        method: 'POST',
        path: `/v1/handoffs/${segment(handoffId)}/${answer}`,
        auth: true,
        parse: (json) => handoffSchema.parse(json),
      }),
  }
}
