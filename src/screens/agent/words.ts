import type { AgentKind, ControlLevel, EscalationTrigger, Weekday } from 'tula-closeline-contract'
import type { AgentControl } from '~/api/agent'

type EscalationAction = AgentControl['escalationRules'][number]['action']

/** The plain name of each kind of Agent. */
export const KIND_NAME: Record<AgentKind, string> = {
  inbound: 'Inbound Agent',
  outbound: 'Outbound Agent',
}

/** What each control level does, in plain words. */
export const LEVEL_WORD: Record<ControlLevel, { readonly name: string; readonly effect: string }> =
  {
    supervised: {
      name: 'Supervised',
      effect: 'Every Draft waits for a person to approve it before it is sent.',
    },
    assisted: {
      name: 'Assisted',
      effect:
        'A plain answer to a Prospect’s question is sent on its own. Anything else waits for a person.',
    },
    autonomous: {
      name: 'Autonomous',
      effect:
        'Every reply is sent on its own. The fixed rules above still hold a reply that needs a person.',
    },
  }

/** The plain name of each escalation trigger. */
export const TRIGGER_WORD: Record<EscalationTrigger, string> = {
  pricing_question: 'The Prospect asks about pricing',
  contract_or_legal: 'The Prospect raises a contract or legal point',
  complaint: 'The Prospect complains',
  competitor_mentioned: 'The Prospect mentions a competitor',
  senior_decision_maker: 'A senior decision maker joins',
  negative_sentiment: 'The Prospect sounds unhappy',
  out_of_playbook: 'The question is outside the Playbook',
}

/** The plain words for each escalation action. */
export const ACTION_WORD: Record<EscalationAction, string> = {
  hand_over: 'Hand over to a person',
  notify_manager: 'Notify a Manager',
}

/** The short and the long name of each weekday. */
export const DAY_WORD: Record<Weekday, { readonly short: string; readonly long: string }> = {
  mon: { short: 'Mon', long: 'Monday' },
  tue: { short: 'Tue', long: 'Tuesday' },
  wed: { short: 'Wed', long: 'Wednesday' },
  thu: { short: 'Thu', long: 'Thursday' },
  fri: { short: 'Fri', long: 'Friday' },
  sat: { short: 'Sat', long: 'Saturday' },
  sun: { short: 'Sun', long: 'Sunday' },
}

/** The days of a send window grouped by identical hours, such as "Mon, Tue 09:00–17:00; Sat 10:00–12:00". */
export function windowSummary(days: AgentControl['sendWindow']['days'], order: readonly Weekday[]) {
  const groups = new Map<string, string[]>()
  for (const day of order) {
    const found = days.find((item) => item.day === day)
    if (found) {
      const hours = found.windows.map((w) => `${w.start}–${w.end}`).join(', ')
      groups.set(hours, [...(groups.get(hours) ?? []), DAY_WORD[day].short])
    }
  }
  if (groups.size === 0) {
    return 'No day has a send window, so nothing is sent'
  }
  return [...groups].map(([hours, names]) => `${names.join(', ')} ${hours}`).join('; ')
}
