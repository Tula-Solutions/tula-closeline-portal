import { PROSPECT_ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { presentManage } from '~/api/manage-messages'
import { importRefusal } from '~/data/prospect-imports'

/** A failure of a Prospect call in plain words, with the form field it belongs to when there is one. */
export type ProspectFailure = {
  readonly message: string
  readonly field?: 'email' | 'phone' | 'linkedinUrl' | 'name' | 'owner' | 'company'
}

const IDENTITY_FIELD = { email: 'email', phone: 'phone', linkedin: 'linkedinUrl' } as const
const IDENTITY_WORD = {
  email: 'email address',
  phone: 'phone number',
  linkedin: 'LinkedIn address',
} as const

/**
 * Turns a failure of a Prospect call into plain words, branching on the contract's code and never
 * on the status. Codes this table does not own (sign-in, role, rate, server) use the words for the
 * members screens. No message carries text from the service.
 */
export function presentProspect(error: unknown): ProspectFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case PROSPECT_ERRORS['prospect.not_found'].code:
        return {
          message: 'That Prospect or Prospect Company no longer exists, or you cannot see it.',
        }
      case PROSPECT_ERRORS['prospect.duplicate_identity'].code: {
        const kind = error.identityKind
        return kind === undefined
          ? {
              message:
                'Another Prospect in your Organization already has this email address, phone number or LinkedIn address.',
            }
          : {
              message: `Another Prospect in your Organization already has this ${IDENTITY_WORD[kind]}.`,
              field: IDENTITY_FIELD[kind],
            }
      }
      case PROSPECT_ERRORS['prospect.forbidden_owner'].code:
        return {
          message: 'That owner is not allowed. Choose a Rep or Manager of your Organization.',
          field: 'owner',
        }
      case PROSPECT_ERRORS['prospect.company_domain_taken'].code:
        return {
          message: 'Another Prospect Company already has this domain.',
          field: 'company',
        }
      case PROSPECT_ERRORS['prospect.import_invalid'].code:
        return { message: importRefusal(error.importReason) }
      default:
        break
    }
  }
  return presentManage(error)
}
