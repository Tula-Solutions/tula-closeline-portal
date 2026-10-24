import { INBOX_ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { presentManage, type ShownFailure } from '~/api/manage-messages'

/**
 * Turns a failure of an inbox call into plain words, branching on the contract's code and never on
 * the status. No message carries text from the service.
 */
export function presentInbox(error: unknown): ShownFailure {
  if (
    error instanceof ApiError &&
    error.code === INBOX_ERRORS['inbox.conversation_not_found'].code
  ) {
    return {
      message: 'That Conversation does not exist, or it is not one you can see.',
    }
  }
  return presentManage(error)
}
