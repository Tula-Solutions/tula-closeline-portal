import {
  DEAL_IMPORT_OPTIONAL_COLUMN,
  DEAL_IMPORT_REQUIRED_COLUMNS,
  type DealImportFailureReason,
  type DealImportHeaderProblem,
  type DealImportRowReason,
  type DealImportState,
  MAX_DEAL_IMPORT_BYTES,
  MAX_DEAL_IMPORT_ROWS,
  type Outcome,
} from 'tula-closeline-contract'

/** The words for each Outcome. */
export const OUTCOME_LABEL: Record<Outcome, string> = { won: 'Won', lost: 'Lost', open: 'Open' }

/** The words for each state of a Deal import. */
export const IMPORT_STATE_LABEL: Record<DealImportState, string> = {
  uploaded: 'Uploaded, waiting to start',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
}

/** States in which an import is still on its way, so its state is worth asking about again. */
export const IMPORT_PENDING_STATES: readonly DealImportState[] = ['uploaded', 'processing']

/** What to tell a person whose whole import failed, and what to do. */
export const IMPORT_FAILURE_WORDS: Record<DealImportFailureReason, string> = {
  too_many_rows: `The file has more than ${MAX_DEAL_IMPORT_ROWS.toLocaleString('en-US')} rows. Split it into smaller files and upload each.`,
  unreadable:
    'The file could not be read as a CSV: a quote that does not close, or a cell longer than 1,000 characters. Fix it and upload it again.',
  processing_failed: 'Something went wrong while processing the file. Upload it again.',
}

/** Why a row was rejected, with what to do about it. The report never echoes a cell, so these say what to check. */
export const ROW_REASON_WORDS: Record<DealImportRowReason, string> = {
  wrong_column_count: 'The row has a different number of cells from the header.',
  invalid_deal_id:
    'The deal id is empty, too long (over 128 characters) or holds a control or invisible character.',
  duplicate_in_file: 'This deal id appeared earlier in the file; only its first row counts.',
  invalid_outcome: 'The outcome is not won, lost or open.',
  invalid_closed_at: 'The closed date is not YYYY-MM-DD or an ISO timestamp with an offset.',
  invalid_amount: 'The amount is not a positive number with at most two decimals.',
  invalid_currency: 'The currency is not three letters, or an amount has no currency.',
  invalid_name: 'The name is longer than 200 characters or holds a control character.',
  outcome_already_decided:
    'This Deal is already won or lost. Correct its Outcome on the Deal page instead.',
  deal_limit_reached: 'The Organization has reached its limit on Deals.',
}

/** Why a file's first row was refused before it was sent (the contract's own check, the same as the service's). */
export const HEADER_PROBLEM_WORDS: Record<DealImportHeaderProblem, string> = {
  empty: 'The first row is empty. It must be the header from the template.',
  too_long: 'The first row is too long to be the header from the template.',
  missing_column: `The first row is missing a column. It must start with ${DEAL_IMPORT_REQUIRED_COLUMNS.join(', ')}.`,
  unexpected_column: `The first row has a column that is not in the template, or repeats one. The columns are ${DEAL_IMPORT_REQUIRED_COLUMNS.join(', ')} and, optionally, ${DEAL_IMPORT_OPTIONAL_COLUMN}.`,
  wrong_order: `The columns are in the wrong order. They must be ${DEAL_IMPORT_REQUIRED_COLUMNS.join(', ')} and, optionally, ${DEAL_IMPORT_OPTIONAL_COLUMN}.`,
  malformed_csv: 'The first row is not valid CSV (check the quotes).',
}

/** The limit on a CSV in the words used in messages ("10 MB"). */
export const MAX_IMPORT_WORDS = `${MAX_DEAL_IMPORT_BYTES / (1024 * 1024)} MB`

/** The words for an Outcome; one this build does not know (a newer service) gets a plain default. */
export function outcomeLabel(outcome: string): string {
  return Object.hasOwn(OUTCOME_LABEL, outcome) ? OUTCOME_LABEL[outcome as Outcome] : 'Unknown'
}

/** The words for an import state, with a default for one this build does not know. */
export function importStateLabel(state: string): string {
  return Object.hasOwn(IMPORT_STATE_LABEL, state)
    ? IMPORT_STATE_LABEL[state as DealImportState]
    : 'Unknown status'
}

/** The words for a whole-import failure, with a general sentence for a reason this build does not know. */
export function importFailureWords(reason: string): string {
  return Object.hasOwn(IMPORT_FAILURE_WORDS, reason)
    ? IMPORT_FAILURE_WORDS[reason as DealImportFailureReason]
    : 'The import failed. Upload the file again.'
}

/** The words for a rejected row's reason, with a general sentence for one this build does not know. */
export function rowReasonWords(reason: string): string {
  return Object.hasOwn(ROW_REASON_WORDS, reason)
    ? ROW_REASON_WORDS[reason as DealImportRowReason]
    : 'The row was rejected.'
}

/**
 * The CSV template a person downloads: the header from the contract and one example row. The
 * example is a made-up deal, not data of the Organization.
 */
export function dealImportTemplate(): string {
  const header = [...DEAL_IMPORT_REQUIRED_COLUMNS, DEAL_IMPORT_OPTIONAL_COLUMN].join(',')
  const example = ['D-1001', 'won', '2026-01-31', '12000.00', 'EUR', 'Example renewal'].join(',')
  return `${header}\r\n${example}\r\n`
}

/**
 * How long to wait before asking again about an import (or a Call) that is still on its way. It
 * starts at three seconds, grows to 30, and ends after about ten minutes.
 */
export const SALES_POLL_SCHEDULE_MS: readonly number[] = [
  3_000,
  5_000,
  10_000,
  20_000,
  ...Array.from({ length: 18 }, () => 30_000),
]

/** The pages of this section a person may be sent back to after confirming the rights wording. */
export const BACK_PATHS = [
  '/sales-history',
  '/sales-history/deals',
  '/sales-history/imports',
] as const

/** One of {@link BACK_PATHS}. */
export type BackPath = (typeof BACK_PATHS)[number]

/** A `from` search value if (and only if) it is exactly one of the allowed pages; anything else (another site, another path) is dropped. */
export function parseBackPath(value: unknown): BackPath | undefined {
  return BACK_PATHS.find((path) => path === value)
}
