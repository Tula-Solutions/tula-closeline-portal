import {
  AGENT_KINDS,
  type AgentKind,
  ASSESSMENT_VERDICTS,
  type AssessmentVerdict,
  FINDING_CATEGORIES,
  type FindingCategory,
} from 'tula-closeline-contract'
import type { AssessmentFilter } from '~/api/assessments'
import { addDays, dayString, isCalendarDay, rangeProblem } from '~/screens/analytics/range'

/** What the address of the review may carry; each is optional and checked. No verdict means "flagged": warnings and failures. */
export type AssessmentSearch = {
  verdict?: AssessmentVerdict
  category?: FindingCategory
  agentKind?: AgentKind
  from?: string
  to?: string
}

function oneOf<T extends string>(choices: readonly T[], value: unknown): T | undefined {
  return choices.find((choice) => choice === value)
}

/** Keeps only the values that are valid and drops the rest, so a hand-edited address cannot reach a call. */
export function readAssessmentSearch(search: Record<string, unknown>): AssessmentSearch {
  const verdict = oneOf(ASSESSMENT_VERDICTS, search.verdict)
  const category = oneOf(FINDING_CATEGORIES, search.category)
  const agentKind = oneOf(AGENT_KINDS, search.agentKind)
  return {
    ...(verdict === undefined ? {} : { verdict }),
    ...(category === undefined ? {} : { category }),
    ...(agentKind === undefined ? {} : { agentKind }),
    ...(isCalendarDay(search.from) ? { from: search.from } : {}),
    ...(isCalendarDay(search.to) ? { to: search.to } : {}),
  }
}

/** `now` with `next` laid over it; a key set to undefined is removed. */
export function mergeAssessmentSearch(
  now: AssessmentSearch,
  next: { readonly [K in keyof AssessmentSearch]: AssessmentSearch[K] | undefined }
): AssessmentSearch {
  const merged: Record<string, unknown> = { ...now }
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) {
      delete merged[key]
    } else {
      merged[key] = value
    }
  }
  return readAssessmentSearch(merged)
}

/** The sentence that says why the dates cannot be asked, or null. Checked before any call. */
export function datesProblem(search: AssessmentSearch): string | null {
  if (search.from !== undefined && search.to !== undefined && search.to < search.from) {
    return 'The end date is before the start date.'
  }
  return null
}

/** The list call's filter for an address; dates that contradict each other are left out. */
export function assessmentFilter(search: AssessmentSearch): AssessmentFilter {
  const dates = datesProblem(search) === null
  return {
    verdict: search.verdict,
    category: search.category,
    agentKind: search.agentKind,
    from: dates ? search.from : undefined,
    to: dates ? search.to : undefined,
  }
}

/** The weeks of failure rates the chart shows when the address names no range. */
export const DEFAULT_RATE_WEEKS = 12

/** The range the failure-rate chart reads: the address's dates when both are set and within 13 months, else the last {@link DEFAULT_RATE_WEEKS} weeks ending `today`. */
export function rateRange(search: AssessmentSearch, today: string): { from: string; to: string } {
  if (
    search.from !== undefined &&
    search.to !== undefined &&
    rangeProblem(search.from, search.to) === null
  ) {
    return { from: search.from, to: search.to }
  }
  return { from: addDays(today, -(DEFAULT_RATE_WEEKS * 7 - 1)), to: today }
}

/** Today as a calendar day in UTC. */
export function todayString(now: Date = new Date()): string {
  return dayString(now)
}
