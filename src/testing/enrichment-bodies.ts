const id = (prefix: string, n: number) => `${prefix}_${n.toString(16).padStart(32, '0')}`
const NOW = '2026-10-28T10:00:00.000Z'

/** A Prospect id in the contract's shape, for the enrichment tests. */
export const prospectId = (n: number) => id('prs', n)

/** One enriched field with its provenance. */
export function fieldBody(overrides: Record<string, unknown> = {}) {
  return {
    field: 'jobTitle',
    value: 'VP of Sales',
    truncated: false,
    provider: 'apollo',
    confidence: 90,
    obtainedAt: NOW,
    costMicros: 20_000,
    application: 'written',
    ...overrides,
  }
}

/** What outbound knows about a Prospect. */
export function enrichmentBody(fields: Record<string, unknown>[] = []) {
  return {
    prospectId: prospectId(1),
    fields,
    emailVerification: null,
    costMicros: fields.length * 20_000,
    costByProvider:
      fields.length === 0 ? [] : [{ provider: 'apollo', costMicros: 20_000, calls: 1 }],
    lastRunId: null,
    lastEnrichedAt: null,
  }
}

/** One enrichment run. */
export function runBody(overrides: Record<string, unknown> = {}) {
  return {
    id: id('erun', 1),
    runSetId: id('erset', 1),
    prospectId: prospectId(1),
    status: 'complete',
    stopReason: null,
    groups: ['person'],
    attempts: [],
    fields: [],
    emailVerification: null,
    costMicros: 0,
    ceilingMicros: 2_000_000,
    requestedByUserId: null,
    startedAt: NOW,
    createdAt: NOW,
    completedAt: NOW,
    ...overrides,
  }
}

/** A bulk request's progress. */
export function runSetBody(overrides: Record<string, unknown> = {}) {
  return {
    id: id('erset', 1),
    total: 1,
    counts: { queued: 0, running: 0, complete: 1, incomplete: 0, stopped: 0 },
    costMicros: 20_000,
    done: true,
    requestedByUserId: null,
    createdAt: NOW,
    completedAt: NOW,
    ...overrides,
  }
}

/** A provider as settings show it: never the key. */
export function providerBody(provider: string, overrides: Record<string, unknown> = {}) {
  return {
    provider,
    enabled: true,
    credentialSet: true,
    credentialUpdatedAt: NOW,
    groups: ['person'],
    updatedAt: NOW,
    ...overrides,
  }
}

/** The provider order. */
export const waterfallBody = (version = 1) => ({
  order: {
    person: ['apollo', 'exa_search'],
    company: ['apollo'],
    email_verification: ['zerobounce'],
  },
  version,
  updatedAt: NOW,
})

/** The monthly budget. */
export const budgetBody = (version = 1) => ({
  month: '2026-10',
  monthlyLimitMicros: 250_000_000,
  perRunCeilingMicros: 2_000_000,
  spentMicros: 12_500_000,
  remainingMicros: 237_500_000,
  resetsAt: '2026-11-01T00:00:00.000Z',
  version,
  updatedAt: NOW,
})

/** A fit score with one match. */
export const fitBody = () => ({
  prospectId: prospectId(1),
  score: 40,
  maxScore: 60,
  matches: [
    { criterionId: id('fcr', 1), name: 'Sales leader', weight: 40, result: 'matched' },
    { criterionId: id('fcr', 2), name: 'Mid-size company', weight: 20, result: 'missed' },
  ],
  criteriaVersion: 3,
  scoredAt: NOW,
})

/** A Fit Criterion (job title is one of "VP Sales"). */
export const criterionBody = () => ({
  id: id('fcr', 1),
  name: 'Sales leader',
  field: 'jobTitle',
  condition: { operator: 'one_of', values: ['VP Sales'] },
  weight: 40,
  enabled: true,
  createdAt: NOW,
  updatedAt: NOW,
})
