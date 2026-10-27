import {
  type CreateRoutingRuleRequest,
  createRoutingRuleRequestSchema,
  IDEMPOTENCY_KEY_HEADER,
  type RoutingResult,
  type RoutingRule,
  reorderRoutingRulesRequestSchema,
  routingResultSchema,
  routingRuleSchema,
  type TestRoutingRequest,
  testRoutingRequestSchema,
} from 'tula-closeline-contract'
import { z } from 'zod'
import type { PageRequest } from '~/api/core'
import type { HttpClient } from '~/api/http'

/** One page of Routing Rules, in the order they are tried. */
export type RoutingRulesPage = {
  readonly items: readonly RoutingRule[]
  readonly nextCursor: string | null
}

const pageSchema = z.object({
  items: z.array(routingRuleSchema),
  nextCursor: z.string().min(1).nullable(),
})

/** The core routes of Routing Rules (Owner, Admin and Manager; reordering is Owner and Admin only). */
export type RoutingApi = {
  /** One page of the Organization's Routing Rules, first tried first. */
  list(page: PageRequest): Promise<RoutingRulesPage>
  /** Adds a rule; core answers a replayed key with the first result. */
  create(body: CreateRoutingRuleRequest, idempotencyKey: string): Promise<RoutingRule>
  /** Replaces a rule's name, conditions, target and default flag. */
  update(id: string, body: CreateRoutingRuleRequest): Promise<RoutingRule>
  /** Deletes a rule. */
  remove(id: string): Promise<void>
  /** Puts every rule in this order (all ids once each, the default rule last). */
  reorder(ruleIds: readonly string[]): Promise<RoutingRulesPage>
  /** Which rule would win for a sample Prospect, and who would be tried; nothing is recorded. */
  test(body: TestRoutingRequest): Promise<RoutingResult>
}

const segment = encodeURIComponent

/** Builds the Routing Rule routes over an HTTP client for same-origin paths, which sends the access token. */
export function createRoutingApi(http: HttpClient): RoutingApi {
  const one = (json: unknown) => routingRuleSchema.parse(json)
  return {
    list: (page) =>
      http.request({
        path: '/v1/routing-rules',
        query: { cursor: page.cursor, limit: page.limit },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => pageSchema.parse(json),
      }),
    create: (body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: '/v1/routing-rules',
        body: createRoutingRuleRequestSchema.parse(body),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: one,
      }),
    update: (id, body) =>
      http.request({
        method: 'PUT',
        path: `/v1/routing-rules/${segment(id)}`,
        body: createRoutingRuleRequestSchema.parse(body),
        auth: true,
        parse: one,
      }),
    remove: (id) =>
      http.request<void>({
        method: 'DELETE',
        path: `/v1/routing-rules/${segment(id)}`,
        auth: true,
      }),
    reorder: (ruleIds) =>
      http.request({
        method: 'POST',
        path: '/v1/routing-rules/reorder',
        body: reorderRoutingRulesRequestSchema.parse({ ruleIds }),
        auth: true,
        parse: (json) => pageSchema.parse(json),
      }),
    test: (body) =>
      http.request({
        method: 'POST',
        path: '/v1/routing-rules/test',
        body: testRoutingRequestSchema.parse(body),
        auth: true,
        parse: (json) => routingResultSchema.parse(json),
      }),
  }
}
