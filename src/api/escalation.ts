import { teamIdSchema } from 'tula-closeline-contract'
import { z } from 'zod'
import { PAGE_SIZE, type PageRequest } from '~/api/core'
import type { HttpClient } from '~/api/http'

/** What sets an escalation off; the order is the order core lists the rules in. */
export const ESCALATION_TRIGGERS = [
  'asks_for_person',
  'pricing_or_legal',
  'negative_tone',
  'low_confidence',
  'writer_failure',
] as const

/** Where an escalated Conversation goes. */
export const ESCALATION_TARGETS = ['prospect_owner', 'team_round_robin', 'admin_queue'] as const

/** One trigger of an escalation. */
export type EscalationTrigger = (typeof ESCALATION_TRIGGERS)[number]

/** One target of an escalation. */
export type EscalationTarget = (typeof ESCALATION_TARGETS)[number]

/** Core's escalation rule as it answers (the contract has no schema for it yet, so this follows core's OpenAPI document). */
export const escalationRuleSchema = z.object({
  id: z.string(),
  trigger: z.enum(ESCALATION_TRIGGERS),
  target: z.enum(ESCALATION_TARGETS),
  teamId: teamIdSchema.nullable(),
  threshold: z.number().nullable(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/** One escalation rule: a trigger, where it routes to, and whether it is on. */
export type EscalationRule = z.infer<typeof escalationRuleSchema>

const escalationRulePageSchema = z.object({
  items: z.array(escalationRuleSchema),
  nextCursor: z.string().nullable(),
})

/** One page of escalation rules, in trigger order. */
export type EscalationRulesPage = z.infer<typeof escalationRulePageSchema>

/** What setting a rule sends; `teamId` only for a Team round-robin and `threshold` only for low confidence. */
export type EscalationRuleRequest = {
  readonly target: EscalationTarget
  readonly teamId?: string
  readonly threshold?: number
  readonly enabled: boolean
}

/** The core routes the portal uses to set where a Conversation that needs a person goes (Owner, Admin). */
export type EscalationApi = {
  /** One page of the rules, in trigger order. */
  listRules(page: PageRequest): Promise<EscalationRulesPage>
  /** Replaces the rule of a trigger; it is idempotent, so a repeat needs no key. */
  setRule(trigger: EscalationTrigger, rule: EscalationRuleRequest): Promise<EscalationRule>
  /** Removes the rule of a trigger. */
  deleteRule(trigger: EscalationTrigger): Promise<void>
}

const segment = encodeURIComponent

/** Builds the escalation routes over an HTTP client for same-origin paths, which sends the access token. */
export function createEscalationApi(http: HttpClient): EscalationApi {
  return {
    listRules: (page) =>
      http.request({
        path: '/v1/escalation-rules',
        query: { cursor: page.cursor, limit: page.limit ?? PAGE_SIZE },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => escalationRulePageSchema.parse(json),
      }),
    setRule: (trigger, rule) =>
      http.request({
        method: 'PUT',
        path: `/v1/escalation-rules/${segment(trigger)}`,
        body: rule,
        auth: true,
        parse: (json) => escalationRuleSchema.parse(json),
      }),
    deleteRule: (trigger) =>
      http.request<void>({
        method: 'DELETE',
        path: `/v1/escalation-rules/${segment(trigger)}`,
        auth: true,
      }),
  }
}
