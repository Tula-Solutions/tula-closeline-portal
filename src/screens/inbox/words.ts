import type {
  ConversationController,
  ConversationState,
  DecisionKind,
  DraftHoldReason,
  DraftStatus,
  InboxChannel,
  ReplyLabel,
} from 'tula-closeline-contract'

/** The plain word for each channel a Conversation runs on. */
export const CHANNEL_WORD: Record<InboxChannel, string> = {
  email: 'Email',
  linkedin: 'LinkedIn',
  chat: 'Chat',
}

/** The plain words for each state of a Conversation. */
export const STATE_WORD: Record<ConversationState, string> = {
  agent: 'Agent answering',
  awaiting_approval: 'Draft waiting for approval',
  rep: 'Rep answering',
  escalated: 'Needs a person',
  closed: 'Closed',
}

/** The plain words for what a reply means. */
export const LABEL_WORD: Record<ReplyLabel, string> = {
  positive: 'Positive',
  question: 'Question',
  objection: 'Objection',
  not_now: 'Not now',
  wrong_person: 'Wrong person',
  unsubscribe: 'Unsubscribe',
  out_of_office: 'Out of office',
  bounce: 'Bounce',
  negative: 'Negative',
  other: 'Other',
}

/** Who is writing now, as a short noun phrase. A Rep is named when the name is known. */
export function writerWord(controller: ConversationController, repName: string | undefined) {
  if (controller === 'agent') {
    return 'The Agent'
  }
  return repName === undefined ? 'A Rep' : repName
}

/** Why a Draft waits for a person, in plain words. */
export const HOLD_WORD: Record<DraftHoldReason, string> = {
  policy: 'Your approval policy asks for a person to review it.',
  ungrounded: 'It cites nothing from your Playbook.',
  check_failed: 'One of its checks failed.',
  escalated: 'The Prospect needs a person.',
  first_message: 'It is the first message to this Prospect.',
}

/** The words for a decision recorded against a Draft. */
export const DECISION_WORD: Record<DecisionKind, string> = {
  approve: 'Approved',
  edit_approve: 'Edited and approved',
  reject: 'Rejected',
  auto_release: 'Released by policy',
  takeover: 'Rep took over',
  hand_back: 'Handed back to the Agent',
}

/** The words for a Draft's status. */
export const DRAFT_STATUS_WORD: Record<DraftStatus, string> = {
  pending: 'Waiting for a decision',
  approved: 'Approved',
  rejected: 'Rejected',
  sent: 'Approved and sent',
  superseded: 'Replaced by a newer Draft',
  void: 'No longer needed',
}
