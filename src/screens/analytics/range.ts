import { isAnalyticsRangeTooLarge, MAX_ANALYTICS_RANGE_MONTHS } from 'tula-closeline-contract'

const DAY_MS = 24 * 60 * 60 * 1000

/** The ranges offered as one click; each ends today and counts today as a day. */
export const RANGE_PRESETS: readonly { readonly days: number; readonly text: string }[] = [
  { days: 7, text: 'Last 7 days' },
  { days: 30, text: 'Last 30 days' },
  { days: 90, text: 'Last 90 days' },
  { days: 365, text: 'Last 12 months' },
]

/** A calendar day as `YYYY-MM-DD`, in UTC, as the analytics routes count days. */
export function dayString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Whether `value` is a real calendar day written `YYYY-MM-DD`. */
export function isCalendarDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  const time = Date.parse(`${value}T00:00:00.000Z`)
  return !Number.isNaN(time) && dayString(new Date(time)) === value
}

/** The day `count` days after `day` (before it when negative). */
export function addDays(day: string, count: number): string {
  return dayString(new Date(Date.parse(`${day}T00:00:00.000Z`) + count * DAY_MS))
}

/** The range of the last `days` days, ending on `today` (a day string). */
export function presetRange(days: number, today: string): { from: string; to: string } {
  return { from: addDays(today, -(days - 1)), to: today }
}

/** Every day from `from` to `to`, both included; empty when the range is backwards. */
export function eachDay(from: string, to: string): readonly string[] {
  const days: string[] = []
  const last = Date.parse(`${to}T00:00:00.000Z`)
  for (let time = Date.parse(`${from}T00:00:00.000Z`); time <= last; time += DAY_MS) {
    days.push(dayString(new Date(time)))
  }
  return days
}

/** The sentence that says why a range cannot be asked, or null when it can. Checked before any call. */
export function rangeProblem(from: string, to: string): string | null {
  if (!isCalendarDay(from) || !isCalendarDay(to)) {
    return 'Choose a start and an end date.'
  }
  if (to < from) {
    return 'The end date is before the start date.'
  }
  if (isAnalyticsRangeTooLarge(from, to)) {
    return `That date range is longer than ${MAX_ANALYTICS_RANGE_MONTHS} months. Choose a shorter one.`
  }
  return null
}
