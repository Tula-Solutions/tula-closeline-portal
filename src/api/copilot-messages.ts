import {
  COPILOT_ERRORS,
  MAX_COPILOT_MIN_EVIDENCE,
  MIN_COPILOT_MIN_EVIDENCE,
} from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { presentManage, type ShownFailure } from '~/api/manage-messages'

/** The words for a minimum outside 1 to 20 or more Deals than Moments, shown before a request and for the service's refusal. */
export const MIN_EVIDENCE_WORDS = `Ask for ${MIN_COPILOT_MIN_EVIDENCE} to ${MAX_COPILOT_MIN_EVIDENCE} of each, and no more Deals than Moments: a Deal needs at least one Moment.`

/** Turns a failure of a Copilot settings call into plain words, branching on the contract's code and never on the status. */
export function presentCopilot(error: unknown): ShownFailure {
  if (
    error instanceof ApiError &&
    error.code === COPILOT_ERRORS['copilot.min_evidence_invalid'].code
  ) {
    return {
      message: MIN_EVIDENCE_WORDS,
    }
  }
  return presentManage(error)
}
