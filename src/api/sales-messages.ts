import { SALES_HISTORY_ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import type { ShownFailure } from '~/api/manage-messages'
import { type DocumentAction, presentDocument } from '~/api/playbook-messages'
import { MAX_IMPORT_WORDS } from '~/data/sales-history'

/** Which sales-history call failed, where a code means more than one thing. */
export type SalesAction = 'list' | 'rights' | 'lookup' | 'outcome' | 'import-upload' | 'import-read'

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
  const asDocument: DocumentAction = action === 'import-upload' ? 'upload' : 'list'
  return presentDocument(error, asDocument)
}
