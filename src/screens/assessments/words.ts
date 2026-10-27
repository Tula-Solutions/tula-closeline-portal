import type {
  AgentKind,
  AssessmentVerdict,
  FindingCategory,
  FindingSeverity,
} from 'tula-closeline-contract'
import type { FindingFeedback } from '~/api/assessments'

/** What each kind of finding is called on screen. */
export const CATEGORY_WORD: Readonly<Record<FindingCategory, string>> = {
  unsupported_claim: 'Unsupported claim',
  policy_deviation: 'Policy deviation',
  missing_disclosure: 'Missing disclosure',
  tone: 'Tone',
}

/** How serious a finding is, in plain words. */
export const SEVERITY_WORD: Readonly<Record<FindingSeverity, string>> = {
  low: 'minor',
  medium: 'moderate',
  high: 'serious',
}

/** What each verdict is called on screen. */
export const VERDICT_WORD: Readonly<Record<AssessmentVerdict, string>> = {
  pass: 'Passed',
  warn: 'Warning',
  fail: 'Failed',
}

/** The two Agents by name. */
export const AGENT_WORD: Readonly<Record<AgentKind, string>> = {
  inbound: 'Inbound Agent',
  outbound: 'Outbound Agent',
}

/** What a person said about a finding. */
export const FEEDBACK_WORD: Readonly<Record<FindingFeedback, string>> = {
  correct: 'Marked correct',
  false_alarm: 'Marked a false alarm',
}

/** The last characters of an id, so a row can be told apart without showing the whole id. */
export function idTail(id: string): string {
  return id.length <= 8 ? id : `…${id.slice(-8)}`
}

/**
 * The part of a Draft the span points at, or null when the span no longer fits the text (the Draft
 * was edited after it was assessed, or the span is empty). A span holds character positions, never text.
 */
export function quoteSpan(body: string, span: { readonly start: number; readonly end: number }) {
  if (span.start < 0 || span.end <= span.start || span.end > body.length) {
    return null
  }
  const quoted = body.slice(span.start, span.end).trim()
  return quoted === '' ? null : quoted
}
