import {
  ACCEPTED_RECORDING_EXTENSIONS,
  MAX_QUEUED_DEAL_IMPORTS,
  SALES_HISTORY_ERRORS,
} from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import type { ShownFailure } from '~/api/manage-messages'
import { type DocumentAction, presentDocument } from '~/api/playbook-messages'
import { MAX_IMPORT_WORDS, MAX_RECORDING_WORDS, MAX_TRANSCRIPT_WORDS } from '~/data/sales-history'

/** Which sales-history call failed, where a code means more than one thing. */
export type SalesAction =
  | 'list'
  | 'rights'
  | 'lookup'
  | 'outcome'
  | 'import-upload'
  | 'import-read'
  | 'call-upload'
  | 'recording-upload'
  | 'call-list'
  | 'call-rep'
  | 'call-delete'
  | 'call-restore'

/**
 * Turns a failure of a sales-history call into plain words, branching on the code. Codes this table
 * does not own (sign-in, role, rate, server) fall back to the words for Playbook documents. No
 * message carries text from the service: every sentence is fixed here.
 */
export function presentSales(error: unknown, action: SalesAction): ShownFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case SALES_HISTORY_ERRORS['deal.not_found'].code:
        return {
          message:
            action === 'lookup'
              ? 'No Deal has that deal id. Check it for typos, or upload a Call or a CSV for it.'
              : 'That Deal no longer exists. Go back to the list.',
        }
      case SALES_HISTORY_ERRORS['deal_import.not_found'].code:
        return { message: 'That import no longer exists. Go back to the list.' }
      case SALES_HISTORY_ERRORS['deal_import.unsupported_type'].code:
        return { message: 'This file type is not supported. Upload the CSV from the template.' }
      case SALES_HISTORY_ERRORS['deal_import.too_large'].code:
        return {
          message: `This file is larger than ${MAX_IMPORT_WORDS}. Split it into smaller files.`,
        }
      case SALES_HISTORY_ERRORS['deal_import.header_invalid'].code:
        return {
          message:
            'The first row does not match the template. Download the template and use its first row.',
        }
      case SALES_HISTORY_ERRORS['deal_import.busy'].code:
        return {
          message: `Up to ${MAX_QUEUED_DEAL_IMPORTS} imports can wait at once. Try again when one finishes.`,
        }
      case SALES_HISTORY_ERRORS['call.not_found'].code:
        return { message: 'That Call no longer exists. Reload the list.' }
      case SALES_HISTORY_ERRORS['call.unsupported_type'].code:
        return {
          message:
            action === 'recording-upload'
              ? `This file type is not supported. Upload a Recording: ${ACCEPTED_RECORDING_EXTENSIONS.join(', ')}.`
              : 'This file type is not supported. Upload a Transcript: .txt, .vtt, .srt or .json.',
        }
      case SALES_HISTORY_ERRORS['call.too_large'].code:
        return {
          message:
            action === 'recording-upload'
              ? `This Recording is larger than ${MAX_RECORDING_WORDS}. Make it smaller or split the Call.`
              : `This file is larger than ${MAX_TRANSCRIPT_WORDS}. Make it smaller or split the Call.`,
        }
      case SALES_HISTORY_ERRORS['call.quota_exceeded'].code:
        return {
          message:
            'Your Organization has reached its limit on Calls. Deleted Calls count until they are purged, so deleting more does not free space at once.',
        }
      case SALES_HISTORY_ERRORS['call.content_in_other_deal'].code:
        return {
          message:
            'This exact file is already stored under another deal id. Check the deal id, or delete the other Call first.',
        }
      case SALES_HISTORY_ERRORS['call.rep_invalid'].code:
        return { message: 'That Rep does not match the Call. Pick one of the speakers listed.' }
      case SALES_HISTORY_ERRORS['call.rep_not_changeable'].code:
        return {
          message:
            'The Rep of this Call cannot be changed now. It can be changed when the Call is ready, waiting for a Rep, or failed because of the Rep. Reload the list.',
        }
      case SALES_HISTORY_ERRORS['call.not_restorable'].code:
        return {
          message:
            'This Call was purged after its retention period and cannot be restored. Upload the file again.',
        }
      case SALES_HISTORY_ERRORS['rights.confirmation_required'].code:
        return {
          message:
            'Your Organization has not confirmed that it may share these Calls, or the wording has changed. Confirm it first.',
        }
      case SALES_HISTORY_ERRORS['rights.version_outdated'].code:
        return {
          message:
            'The confirmation wording has changed since this page loaded. Reload the page and confirm the current wording.',
        }
      default:
        break
    }
  }
  const asDocument: DocumentAction =
    action === 'import-upload' || action === 'call-upload' || action === 'recording-upload'
      ? 'upload'
      : action === 'call-delete'
        ? 'delete'
        : action === 'call-restore'
          ? 'restore'
          : 'list'
  return presentDocument(error, asDocument)
}
