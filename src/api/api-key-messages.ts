import { APIKEY_ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { presentManage, type ShownFailure } from '~/api/manage-messages'

/**
 * Turns a failure of an API key call into plain words, branching on the contract's code and never
 * on the status. The key codes are worded here; every other code uses the words of the members
 * screens. No message carries text from the service.
 */
export function presentApiKey(error: unknown): ShownFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case APIKEY_ERRORS['apikey.not_found'].code:
        return { message: 'That API key no longer exists. Reload the list.' }
      case APIKEY_ERRORS['apikey.scope_not_allowed'].code:
        return {
          message:
            'You cannot give a key more access than your own role has. Choose a lower role ceiling or fewer scopes.',
        }
      case APIKEY_ERRORS['apikey.revoked'].code:
        return { message: 'That API key is already revoked. Reload the list.' }
      case APIKEY_ERRORS['apikey.rate_limited'].code:
        return { message: 'Too many requests. Wait a moment and try again.' }
      default:
        break
    }
  }
  return presentManage(error)
}
