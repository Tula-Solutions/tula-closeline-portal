import {
  type CreateEnrichmentRequest,
  type CreateFitCriterionRequest,
  createEnrichmentRequestSchema,
  createFitCriterionRequestSchema,
  type EnrichmentBudget,
  type EnrichmentRun,
  type EnrichmentRunSet,
  enrichmentBudgetSchema,
  enrichmentRunSetSchema,
  type FitCriterion,
  type FitScore,
  fitCriterionSchema,
  fitScoreSchema,
  IDEMPOTENCY_KEY_HEADER,
  listEnrichmentRunsResponseSchema,
  listFitCriteriaResponseSchema,
  listProvidersResponseSchema,
  listSignalsResponseSchema,
  listSpendResponseSchema,
  type ProspectEnrichment,
  type ProviderSettings,
  prospectEnrichmentSchema,
  providerSettingsSchema,
  type SetBudgetRequest,
  type SetProviderRequest,
  type SetWaterfallRequest,
  setBudgetRequestSchema,
  setProviderRequestSchema,
  setWaterfallRequestSchema,
  type UpdateFitCriterionRequest,
  updateFitCriterionRequestSchema,
  type Waterfall,
  waterfallSchema,
} from 'tula-closeline-contract'
import type { z } from 'zod'
import type { HttpClient } from '~/api/http'

/** One page of Provider settings. */
export type ProvidersPage = z.infer<typeof listProvidersResponseSchema>

/** One page of Signals, newest first. */
export type SignalsPage = z.infer<typeof listSignalsResponseSchema>

/** One page of Fit Criteria, with the version of the set. */
export type FitCriteriaPage = z.infer<typeof listFitCriteriaResponseSchema>

/** One page of the month's spend by provider. */
export type SpendPage = z.infer<typeof listSpendResponseSchema>

/** The enrichment, Signal and Fit routes of outbound that the portal uses. */
export type OutboundApi = {
  /** Enriches one to 500 Prospects; the key makes a repeat press one request. */
  createEnrichment(body: CreateEnrichmentRequest, idempotencyKey: string): Promise<EnrichmentRunSet>
  /** The progress of one bulk request. */
  getRunSet(runSetId: string, signal?: AbortSignal): Promise<EnrichmentRunSet>
  /** The newest run for a Prospect, or null when it was never enriched: its status and why it stopped. */
  getLatestRun(prospectId: string, signal?: AbortSignal): Promise<EnrichmentRun | null>
  /** What is known about a Prospect: each field with provider, time and cost, and the total cost. */
  getProspectEnrichment(prospectId: string, signal?: AbortSignal): Promise<ProspectEnrichment>
  /** The newest Signals of a Prospect (one page). */
  listSignals(prospectId: string, limit: number, signal?: AbortSignal): Promise<SignalsPage>
  /** Why a Prospect scores what it does, criterion by criterion. */
  getProspectFit(prospectId: string, signal?: AbortSignal): Promise<FitScore>
  /** Every provider and whether it has a key (never the key). */
  listProviders(signal?: AbortSignal): Promise<ProvidersPage>
  /** Turns a provider on or off and sets or clears its key; Owner and Admin. */
  setProvider(
    provider: string,
    body: SetProviderRequest,
    idempotencyKey: string
  ): Promise<ProviderSettings>
  /** The provider order for each field group. */
  getWaterfall(signal?: AbortSignal): Promise<Waterfall>
  /** Saves the provider order; a stale version is `enrichment.version_conflict`. */
  setWaterfall(body: SetWaterfallRequest, idempotencyKey: string): Promise<Waterfall>
  /** The monthly limit, the run ceiling and what is spent. */
  getBudget(signal?: AbortSignal): Promise<EnrichmentBudget>
  /** Saves the budget; a stale version is `enrichment.version_conflict`. */
  setBudget(body: SetBudgetRequest, idempotencyKey: string): Promise<EnrichmentBudget>
  /** This month's spend by provider (one page). */
  listSpend(signal?: AbortSignal): Promise<SpendPage>
  /** The Fit Criteria of the Organization (one page). */
  listFitCriteria(signal?: AbortSignal): Promise<FitCriteriaPage>
  /** Adds a Fit Criterion; Owner and Admin. */
  createFitCriterion(body: CreateFitCriterionRequest, idempotencyKey: string): Promise<FitCriterion>
  /** Changes a Fit Criterion. */
  updateFitCriterion(
    id: string,
    body: UpdateFitCriterionRequest,
    idempotencyKey: string
  ): Promise<FitCriterion>
  /** Deletes a Fit Criterion. */
  deleteFitCriterion(id: string, idempotencyKey: string): Promise<void>
}

const segment = encodeURIComponent

/** The most rows the portal asks for in one list; the screens say when there are more. */
export const OUTBOUND_LIST_LIMIT = 100

/** Builds the outbound routes over an HTTP client for same-origin paths, which sends the access token. */
export function createOutboundApi(http: HttpClient): OutboundApi {
  return {
    createEnrichment: (body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: '/v1/enrichment-runs',
        body: createEnrichmentRequestSchema.parse(body),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => enrichmentRunSetSchema.parse(json),
      }),
    getRunSet: (runSetId, signal) =>
      http.request({
        path: `/v1/enrichment-run-sets/${segment(runSetId)}`,
        auth: true,
        signal,
        parse: (json) => enrichmentRunSetSchema.parse(json),
      }),
    getLatestRun: (prospectId, signal) =>
      http.request({
        path: '/v1/enrichment-runs',
        query: { prospectId, limit: 1 },
        auth: true,
        signal,
        parse: (json) => listEnrichmentRunsResponseSchema.parse(json).items[0] ?? null,
      }),
    getProspectEnrichment: (prospectId, signal) =>
      http.request({
        path: `/v1/prospects/${segment(prospectId)}/enrichment`,
        auth: true,
        signal,
        parse: (json) => prospectEnrichmentSchema.parse(json),
      }),
    listSignals: (prospectId, limit, signal) =>
      http.request({
        path: `/v1/prospects/${segment(prospectId)}/signals`,
        query: { limit },
        auth: true,
        signal,
        parse: (json) => listSignalsResponseSchema.parse(json),
      }),
    getProspectFit: (prospectId, signal) =>
      http.request({
        path: `/v1/prospects/${segment(prospectId)}/fit`,
        auth: true,
        signal,
        parse: (json) => fitScoreSchema.parse(json),
      }),
    listProviders: (signal) =>
      http.request({
        path: '/v1/enrichment/providers',
        query: { limit: OUTBOUND_LIST_LIMIT },
        auth: true,
        signal,
        parse: (json) => listProvidersResponseSchema.parse(json),
      }),
    setProvider: (provider, body, idempotencyKey) =>
      http.request({
        method: 'PUT',
        path: `/v1/enrichment/providers/${segment(provider)}`,
        body: setProviderRequestSchema.parse(body),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => providerSettingsSchema.parse(json),
      }),
    getWaterfall: (signal) =>
      http.request({
        path: '/v1/enrichment/waterfall',
        auth: true,
        signal,
        parse: (json) => waterfallSchema.parse(json),
      }),
    setWaterfall: (body, idempotencyKey) =>
      http.request({
        method: 'PUT',
        path: '/v1/enrichment/waterfall',
        body: setWaterfallRequestSchema.parse(body),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => waterfallSchema.parse(json),
      }),
    getBudget: (signal) =>
      http.request({
        path: '/v1/enrichment/budget',
        auth: true,
        signal,
        parse: (json) => enrichmentBudgetSchema.parse(json),
      }),
    setBudget: (body, idempotencyKey) =>
      http.request({
        method: 'PUT',
        path: '/v1/enrichment/budget',
        body: setBudgetRequestSchema.parse(body),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => enrichmentBudgetSchema.parse(json),
      }),
    listSpend: (signal) =>
      http.request({
        path: '/v1/enrichment/spend',
        query: { limit: OUTBOUND_LIST_LIMIT },
        auth: true,
        signal,
        parse: (json) => listSpendResponseSchema.parse(json),
      }),
    listFitCriteria: (signal) =>
      http.request({
        path: '/v1/fit-criteria',
        query: { limit: OUTBOUND_LIST_LIMIT },
        auth: true,
        signal,
        parse: (json) => listFitCriteriaResponseSchema.parse(json),
      }),
    createFitCriterion: (body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: '/v1/fit-criteria',
        body: createFitCriterionRequestSchema.parse(body),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => fitCriterionSchema.parse(json),
      }),
    updateFitCriterion: (id, body, idempotencyKey) =>
      http.request({
        method: 'PATCH',
        path: `/v1/fit-criteria/${segment(id)}`,
        body: updateFitCriterionRequestSchema.parse(body),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => fitCriterionSchema.parse(json),
      }),
    deleteFitCriterion: (id, idempotencyKey) =>
      http.request<void>({
        method: 'DELETE',
        path: `/v1/fit-criteria/${segment(id)}`,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
      }),
  }
}
