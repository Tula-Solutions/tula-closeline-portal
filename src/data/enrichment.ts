import type {
  EmailVerification,
  EnrichedFieldName,
  FieldGroup,
  FitMatch,
  RunStatus,
  StopReason,
} from 'tula-closeline-contract'

/** The plain name of each enriched field. */
export const ENRICHED_FIELD_LABEL: Record<EnrichedFieldName, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  jobTitle: 'Job title',
  linkedinUrl: 'LinkedIn address',
  email: 'Email',
  companyName: 'Company',
  companyDomain: 'Company website',
  industry: 'Industry',
  employeeCount: 'Employees',
  region: 'Region',
  technologies: 'Technologies',
}

/** The plain name of each group of fields a provider can fill. */
export const GROUP_LABEL: Record<FieldGroup, string> = {
  person: 'Person',
  company: 'Company',
  email_verification: 'Email check',
}

/** Why a run stopped before it was done. */
export const STOP_WORD: Record<StopReason, string> = {
  monthly_budget:
    "Stopped: this month's enrichment budget ran out (enrichment.budget_exceeded). Some fields may be missing.",
  run_ceiling: 'Stopped: this run reached its cost ceiling. Some fields may be missing.',
}

/** What the email check found, in a few words. */
export const VERIFICATION_WORD: Record<EmailVerification['reason'], string> = {
  accepted: 'the mailbox accepted it',
  catch_all: 'the domain accepts every address',
  role_based: 'a shared address, not a person',
  disposable: 'a throwaway address',
  mailbox_full: 'the mailbox is full',
  mailbox_not_found: 'there is no such mailbox',
  domain_invalid: 'the domain does not take email',
  unknown: 'the check could not tell',
}

/** What a criterion did for a Prospect. */
export const FIT_RESULT_WORD: Record<FitMatch['result'], string> = {
  matched: 'Matched',
  missed: 'Missed',
  unknown: 'No data to judge',
}

/** The plain word for each state of a run. */
export const RUN_WORD: Record<RunStatus, string> = {
  queued: 'Waiting to start',
  running: 'Running',
  complete: 'Complete',
  incomplete: 'Finished, but no provider could fill everything',
  stopped: 'Stopped',
}

/** A provider key as words: `exa_search` becomes "exa search". Keys are lower-case letters, digits and underscores. */
export function providerName(key: string): string {
  return key.replaceAll('_', ' ')
}

/** Micro-dollars as dollars, with cents shown and sub-cent costs to four places: 12_500 is "$0.0125". */
export function dollars(micros: number): string {
  const value = micros / 1_000_000
  return `$${value >= 0.01 || value === 0 ? value.toFixed(2) : value.toFixed(4)}`
}

/** Whole or fractional dollars typed into a form to micro-dollars, or null when it is not an amount. */
export function toMicros(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(trimmed)) {
    return null
  }
  return Math.round(Number(trimmed) * 1_000_000)
}

/** Micro-dollars as the plain number a dollar field shows: 25_000_000 is "25". */
export function fromMicros(micros: number): string {
  return String(micros / 1_000_000)
}
