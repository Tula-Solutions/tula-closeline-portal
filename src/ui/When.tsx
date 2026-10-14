const DATE = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** A timestamp as a readable local date and time; a value that is not a date is returned as it came. */
export function formatWhen(iso: string): string {
  const time = Date.parse(iso)
  return Number.isNaN(time) ? iso : DATE.format(time)
}

/** A timestamp as a readable local date and time. */
export function When(props: { readonly iso: string }) {
  return <time dateTime={props.iso}>{formatWhen(props.iso)}</time>
}

const DAY = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' })
const MS_PER_DAY = 86_400_000

/**
 * A closing date as a date, and any other time as a date and time. Core stores a date-only closing
 * date (a CSV cell `2026-01-31`) as midnight UTC (`2026-01-31T00:00:00.000Z`) and has no way to say
 * "no time", so an instant exactly at midnight UTC is shown as its UTC date, which no time zone
 * can shift to the day before.
 */
export function formatDayOrWhen(value: string): string {
  const time = Date.parse(value)
  if (Number.isNaN(time)) {
    return value
  }
  return time % MS_PER_DAY === 0 ? DAY.format(time) : formatWhen(value)
}

/** A closing date as a date (see {@link formatDayOrWhen}), and a timestamp as a date and time. */
export function DayOrWhen(props: { readonly value: string }) {
  return <time dateTime={props.value}>{formatDayOrWhen(props.value)}</time>
}
