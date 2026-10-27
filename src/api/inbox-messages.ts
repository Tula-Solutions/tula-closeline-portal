import { INBOX_ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { presentManage, type ShownFailure } from '~/api/manage-messages'

const DRAFT_WORDS: Readonly<Record<string, ShownFailure>> = {
  [INBOX_ERRORS['inbox.draft_not_found'].code]: {
    message: 'That Draft does not exist, or it is not one you can see.',
  },
  [INBOX_ERRORS['inbox.draft_not_pending'].code]: {
    message:
      'That Draft is no longer waiting for a decision. Someone else may have decided it, or the Prospect replied again. Reload to see where it stands.',
  },
  [INBOX_ERRORS['inbox.not_conversation_owner'].code]: {
    message: 'This Conversation belongs to another Rep, so you cannot decide its Drafts.',
  },
  [INBOX_ERRORS['inbox.draft_ungrounded'].code]: {
    message:
      'This Draft cites nothing from your Playbook. Tick the box that confirms you checked it, then approve.',
  },
  [INBOX_ERRORS['inbox.prospect_suppressed'].code]: {
    message: 'This Prospect asked not to be contacted on this channel, so nothing was sent.',
  },
  [INBOX_ERRORS['inbox.conversation_closed'].code]: {
    message: 'This Conversation is closed, so nothing was sent.',
  },
  [INBOX_ERRORS['inbox.takeover_required'].code]: {
    message:
      'A Rep has taken over this Conversation, so its Drafts are not decided here any more. Open the Conversation to reply.',
    link: 'conversation',
  },
}

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
  if (error instanceof ApiError) {
    const words = DRAFT_WORDS[error.code]
    if (words !== undefined) {
      return words
    }
  }
  return presentManage(error)
}

const CONTROL_WORDS: Readonly<Record<string, ShownFailure>> = {
  [INBOX_ERRORS['inbox.already_controlled'].code]: {
    message:
      'Another Rep has already taken over this Conversation. Reload to see who is answering it.',
  },
  [INBOX_ERRORS['inbox.not_taken_over'].code]: {
    message: 'No Rep has taken over this Conversation, so there is nothing to hand back. Reload.',
  },
  [INBOX_ERRORS['inbox.not_conversation_owner'].code]: {
    message:
      'Only the Rep who took over this Conversation, an Admin or an Owner can do that. Reload to see who is answering it.',
  },
  [INBOX_ERRORS['inbox.takeover_required'].code]: {
    message: 'The Agent is answering this Conversation. Take it over before you reply.',
  },
}

/**
 * Words for a failed takeover, hand-back or reply, from the contract's code and never the status;
 * anything else is worded as any inbox failure is.
 */
export function presentConversationControl(error: unknown): ShownFailure {
  if (error instanceof ApiError) {
    const words = CONTROL_WORDS[error.code]
    if (words !== undefined) {
      return words
    }
  }
  return presentInbox(error)
}
