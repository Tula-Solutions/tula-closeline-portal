import {
  AGENT_KINDS,
  type AgentKind,
  campaignIdSchema,
  INBOX_CHANNELS,
  type InboxChannel,
  membershipIdSchema,
  type Role,
} from 'tula-closeline-contract'
import type { AnalyticsFilter } from '~/api/analytics'
import { can } from '~/data/permissions'
import { isCalendarDay, presetRange } from '~/screens/analytics/range'

/** What the address of an analytics view may carry; each is optional and checked. */
export type AnalyticsSearch = {
  from?: string
  to?: string
  channel?: InboxChannel
  agentKind?: AgentKind
  campaignId?: string
  repMembershipId?: string
}

/** The days a view shows when the address names none. */
export const DEFAULT_DAYS = 30

function oneOf<T extends string>(choices: readonly T[], value: unknown): T | undefined {
  return choices.find((choice) => choice === value)
}

/** Keeps only the values that are valid and drops the rest, so a hand-edited address cannot reach a call. */
export function readAnalyticsSearch(search: Record<string, unknown>): AnalyticsSearch {
  const channel = oneOf(INBOX_CHANNELS, search.channel)
  const agentKind = oneOf(AGENT_KINDS, search.agentKind)
  const campaignId = campaignIdSchema.safeParse(search.campaignId)
  const rep = membershipIdSchema.safeParse(search.repMembershipId)
  return {
    ...(isCalendarDay(search.from) ? { from: search.from } : {}),
    ...(isCalendarDay(search.to) ? { to: search.to } : {}),
    ...(channel === undefined ? {} : { channel }),
    ...(agentKind === undefined ? {} : { agentKind }),
    ...(campaignId.success ? { campaignId: campaignId.data } : {}),
    ...(rep.success ? { repMembershipId: rep.data } : {}),
  }
}

/** `now` with `next` laid over it; a key set to undefined is removed. */
export function mergeSearch(
  now: AnalyticsSearch,
  next: { readonly [K in keyof AnalyticsSearch]: AnalyticsSearch[K] | undefined }
): AnalyticsSearch {
  const merged: Record<string, unknown> = { ...now }
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) {
      delete merged[key]
    } else {
      merged[key] = value
    }
  }
  return readAnalyticsSearch(merged)
}

/**
 * The call's filter for this role and address. Core refuses a Manager or Rep who filters by
 * Channel, Agent or Campaign (and a Rep who filters by Rep), so those never leave the portal; the
 * range falls back to the last {@link DEFAULT_DAYS} days ending `today`.
 */
export function analyticsFilter(
  role: Role,
  search: AnalyticsSearch,
  today: string
): AnalyticsFilter {
  const range = presetRange(DEFAULT_DAYS, today)
  const wide = can.compareCampaigns(role)
  return {
    from: search.from ?? range.from,
    to: search.to ?? range.to,
    ...(wide && search.channel ? { channel: search.channel } : {}),
    ...(wide && search.agentKind ? { agentKind: search.agentKind } : {}),
    ...(wide && search.campaignId ? { campaignId: search.campaignId } : {}),
    ...(can.compareReps(role) && search.repMembershipId
      ? { repMembershipId: search.repMembershipId }
      : {}),
  }
}
