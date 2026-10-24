import type {
  ConversationController,
  ConversationState,
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
