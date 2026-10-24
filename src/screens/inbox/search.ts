import {
  CONVERSATION_STATES,
  type ConversationState,
  INBOX_CHANNELS,
  type InboxChannel,
  REPLY_LABELS,
  type ReplyLabel,
} from 'tula-closeline-contract'

/** What the address of the inbox may carry; each is optional and one of the contract's values. */
export type InboxSearch = {
  channel?: InboxChannel
  state?: ConversationState
  label?: ReplyLabel
}

function oneOf<T extends string>(choices: readonly T[], value: unknown): T | undefined {
  return choices.find((choice) => choice === value)
}

/**
 * Keeps only the values the contract knows and drops the rest. The router merges the raw search of
 * parent routes into a route's own, so the screen reads through this too.
 */
export function readInboxSearch(search: Record<string, unknown>): InboxSearch {
  const channel = oneOf(INBOX_CHANNELS, search.channel)
  const state = oneOf(CONVERSATION_STATES, search.state)
  const label = oneOf(REPLY_LABELS, search.label)
  return {
    ...(channel === undefined ? {} : { channel }),
    ...(state === undefined ? {} : { state }),
    ...(label === undefined ? {} : { label }),
  }
}
