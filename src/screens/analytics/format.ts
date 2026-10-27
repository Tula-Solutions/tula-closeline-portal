import type { AnalyticsMetric } from 'tula-closeline-contract'

const COUNT = new Intl.NumberFormat()
const PERCENT = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 })

/** A count with the reader's digit grouping. */
export function formatCount(value: number): string {
  return COUNT.format(value)
}

/** A rate (0 to 1) as a percentage. */
export function formatRate(value: number): string {
  return PERCENT.format(value)
}

/** The words for each counted metric: its name as a heading and what one of them is called. */
export const METRIC_WORDS: Record<
  AnalyticsMetric,
  { readonly name: string; readonly unit: string }
> = {
  sends: { name: 'Sends', unit: 'sends' },
  replies: { name: 'Replies', unit: 'replies' },
  positive_replies: { name: 'Positive replies', unit: 'positive replies' },
  meetings: { name: 'Meetings', unit: 'meetings' },
  outcomes_won: { name: 'Outcomes won', unit: 'won' },
  outcomes_lost: { name: 'Outcomes lost', unit: 'lost' },
}
