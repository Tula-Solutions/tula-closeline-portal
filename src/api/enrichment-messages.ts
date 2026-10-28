import { ENRICHMENT_ERRORS, ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { presentManage, type ShownFailure } from '~/api/manage-messages'

/**
 * Turns a failure of an enrichment, Signal or Fit call into plain words, branching on the
 * contract's code and never on the status. Every other code uses the words of the members screens.
 * No message carries text from the service.
 */
export function presentEnrichment(error: unknown): ShownFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case ENRICHMENT_ERRORS['enrichment.budget_exceeded'].code:
        return {
          message:
            "This month's enrichment budget is spent, so nothing was enriched. An Owner or Admin can raise it under Enrichment.",
        }
      case ENRICHMENT_ERRORS['enrichment.provider_unavailable'].code:
        return {
          message:
            'No provider is switched on with a key for that. An Owner or Admin can set one up under Enrichment.',
        }
      case ENRICHMENT_ERRORS['enrichment.prospect_not_found'].code:
        return { message: 'That Prospect no longer exists, or you cannot see it. Reload the page.' }
      case ENRICHMENT_ERRORS['enrichment.verification_failed'].code:
        return { message: 'A Prospect with no email address cannot have its email checked.' }
      case ENRICHMENT_ERRORS['enrichment.run_not_found'].code:
      case ENRICHMENT_ERRORS['enrichment.run_set_not_found'].code:
        return { message: 'That enrichment request is gone. Reload the page.' }
      case ENRICHMENT_ERRORS['enrichment.provider_unknown'].code:
        return { message: 'There is no such provider. Reload the page.' }
      case ENRICHMENT_ERRORS['enrichment.invalid_waterfall'].code:
        return { message: 'That provider order is not valid. Reload the page and try again.' }
      case ENRICHMENT_ERRORS['enrichment.version_conflict'].code:
        return {
          message:
            'Someone else changed this while you were editing. Reload the page to see their change, then make yours again.',
        }
      case ENRICHMENT_ERRORS['fit.invalid_criteria'].code:
        return { message: 'Check the criterion: its values, its weight and the field it uses.' }
      case ENRICHMENT_ERRORS['fit.criterion_not_found'].code:
        return { message: 'That criterion no longer exists. Reload the page.' }
      case ERRORS['request.invalid'].code:
        return { message: 'Check the details you entered and try again.' }
      default:
        break
    }
  }
  return presentManage(error)
}
