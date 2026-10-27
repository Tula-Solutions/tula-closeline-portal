import { AGENT_ERRORS, ERRORS, MAX_AGENT_INSTRUCTION_LENGTH } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { presentManage, type ShownFailure } from '~/api/manage-messages'

/**
 * Turns a failure of an Agent instruction, control level or pause call into plain words, branching
 * on the contract's code and never on the status. Every other code uses the words of the members
 * screens. No message carries text from the service.
 */
export function presentAgent(error: unknown): ShownFailure {
  if (error instanceof ApiError) {
    switch (error.code) {
      case AGENT_ERRORS['agent.settings_invalid'].code:
        return {
          message:
            'Those settings are not allowed. Keep every send window between 08:00 and 21:00, with each start before its end, and use a real time zone.',
        }
      case AGENT_ERRORS['agent.version_not_found'].code:
        return { message: 'That version no longer exists. Reload the page.' }
      case AGENT_ERRORS['agent.instruction_too_long'].code:
        return {
          message: `Keep the instructions to ${MAX_AGENT_INSTRUCTION_LENGTH} characters.`,
        }
      case ERRORS['request.invalid'].code:
        return { message: 'Check the details you entered and try again.' }
      default:
        break
    }
  }
  return presentManage(error)
}
