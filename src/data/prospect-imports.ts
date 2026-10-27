import {
  MAX_PROSPECT_IMPORT_BYTES,
  MAX_PROSPECT_IMPORT_ROWS,
  PROSPECT_IMPORT_COLUMNS,
  type PROSPECT_IMPORT_INVALID_REASONS,
  type ProspectImportFailureReason,
  type ProspectImportRowReason,
  type ProspectImportRowResult,
  type ProspectImportState,
} from 'tula-closeline-contract'

/** The limit on a CSV in the words used in messages ("10 MB"). */
export const MAX_IMPORT_WORDS = `${MAX_PROSPECT_IMPORT_BYTES / (1024 * 1024)} MB`

/** The most rows a file may hold, as shown to people ("50,000"). */
export const MAX_ROWS_WORDS = MAX_PROSPECT_IMPORT_ROWS.toLocaleString('en-US')

/** The words for each state of a Prospect import. */
export const PROSPECT_IMPORT_STATE_LABEL: Record<ProspectImportState, string> = {
  uploaded: 'Uploaded, waiting to start',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
}

/** States in which an import is still on its way, so its state is worth asking about again. */
export const PROSPECT_IMPORT_PENDING_STATES: readonly ProspectImportState[] = [
  'uploaded',
  'processing',
]

/** The words for an import state, with a default for one this build does not know. */
export function prospectImportStateLabel(state: string): string {
  return Object.hasOwn(PROSPECT_IMPORT_STATE_LABEL, state)
    ? PROSPECT_IMPORT_STATE_LABEL[state as ProspectImportState]
    : 'Unknown status'
}

/** What to tell a person whose whole import failed, and what to do. */
export const PROSPECT_IMPORT_FAILURE_WORDS: Record<ProspectImportFailureReason, string> = {
  too_many_rows: `The file has more than ${MAX_ROWS_WORDS} rows. Split it into smaller files and upload each.`,
  unreadable:
    'The file could not be read as a CSV: a quote that does not close, or a cell that is too long. Fix it and upload it again.',
  processing_failed:
    'We could not process this file in time. Upload it again; the file itself was fine.',
}

/** The words for a whole-import failure, with a general sentence for a reason this build does not know. */
export function prospectImportFailureWords(reason: string | null): string {
  return reason !== null && Object.hasOwn(PROSPECT_IMPORT_FAILURE_WORDS, reason)
    ? PROSPECT_IMPORT_FAILURE_WORDS[reason as ProspectImportFailureReason]
    : 'The import failed. Upload the file again.'
}

/** Why a row was skipped or rejected, with what to check. The report never echoes a cell. */
export const ROW_REASON_WORDS: Record<ProspectImportRowReason, string> = {
  no_change: 'The Prospect already had these values, so nothing changed.',
  manual_values_kept: 'A person edited this Prospect by hand, so those values were kept.',
  wrong_column_count: 'The row has a different number of cells from the header.',
  blank_row:
    'The row is a blank line in the middle of the file. Delete it; blank lines at the end are ignored.',
  missing_identity: 'The row has no email address, phone number or LinkedIn address.',
  invalid_email: 'The email address is not valid.',
  invalid_phone: 'The phone number is not valid. Use the international form, such as +14155550100.',
  invalid_linkedin_url: 'The LinkedIn address is not a linkedin.com profile address.',
  invalid_name: 'The first or last name is too long or holds a control character.',
  invalid_job_title: 'The job title is too long or holds a control character.',
  invalid_company: 'The company name or domain is not valid.',
  invalid_tags: 'The tags are not valid: too many, too long, or not separated by semicolons.',
  owner_not_found: 'No member of your Organization has the owner email in this row.',
  owner_not_allowed: 'That member cannot own Prospects. Name a Rep or Manager.',
  duplicate_in_file: 'This Prospect appeared earlier in the file; only its first row counts.',
  identity_conflict:
    'The email, phone and LinkedIn address in this row belong to different Prospects.',
}

/** The words for a row's reason, with a general sentence for one this build does not know. */
export function rowReasonWords(reason: string | null): string {
  if (reason === null) {
    return ''
  }
  return Object.hasOwn(ROW_REASON_WORDS, reason)
    ? ROW_REASON_WORDS[reason as ProspectImportRowReason]
    : 'See the downloaded report for the reason.'
}

/** The words for each result of a row. */
export const ROW_RESULT_LABEL: Record<ProspectImportRowResult, string> = {
  created: 'Created',
  updated: 'Updated',
  skipped: 'Skipped',
  rejected: 'Rejected',
}

/** The words for a row result, with a default for one this build does not know. */
export function rowResultLabel(result: string): string {
  return Object.hasOwn(ROW_RESULT_LABEL, result)
    ? ROW_RESULT_LABEL[result as ProspectImportRowResult]
    : 'Unknown'
}

/** Why core refused the file itself, in words, one per contract reason. */
const REFUSAL_WORDS: Record<(typeof PROSPECT_IMPORT_INVALID_REASONS)[number], string> = {
  unsupported_type: 'This is not a CSV. Upload a .csv file made from the template.',
  too_large: `This file is larger than ${MAX_IMPORT_WORDS}. Split it into smaller files.`,
  header_invalid: `The first row does not match the template. It must be ${PROSPECT_IMPORT_COLUMNS.join(', ')}.`,
  too_many_rows: `The file has more than ${MAX_ROWS_WORDS} rows. Split it into smaller files.`,
}

/** The words for a refused file; without a reason this build knows, a general sentence. */
export function importRefusal(reason: string | undefined): string {
  return reason !== undefined && Object.hasOwn(REFUSAL_WORDS, reason)
    ? REFUSAL_WORDS[reason as keyof typeof REFUSAL_WORDS]
    : 'The file was not accepted. Check that it is a CSV made from the template and upload it again.'
}

/**
 * The CSV template a person downloads: the header from the contract and one example row. The
 * example is a made-up Prospect, not data of the Organization.
 */
export function prospectImportTemplate(): string {
  const example: Record<(typeof PROSPECT_IMPORT_COLUMNS)[number], string> = {
    first_name: 'Ada',
    last_name: 'Example',
    email: 'ada@example.com',
    phone: '+14155550100',
    linkedin_url: 'https://www.linkedin.com/in/ada-example',
    job_title: 'Head of Sales',
    company_name: 'Example Ltd',
    company_domain: 'example.com',
    owner_email: '',
    tags: 'renewal;2026',
  }
  const header = PROSPECT_IMPORT_COLUMNS.join(',')
  const row = PROSPECT_IMPORT_COLUMNS.map((column) => example[column]).join(',')
  return `${header}\r\n${row}\r\n`
}
