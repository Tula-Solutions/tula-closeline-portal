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

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * A calendar date (`YYYY-MM-DD`, a Deal's closing date) as that date, such as "Jan 31, 2026". It has
 * no time and no time zone, so it is built from its own year, month and day and formatted in UTC:
 * never `new Date('2026-01-31')` shown in local time, which moves it to the day before west of UTC.
 * A value that is not a calendar date is returned as it came. Timestamps use {@link formatWhen}.
 */
export function formatDateOnly(value: string): string {
  const match = CALENDAR_DATE.exec(value)
  if (match === null) {
    return value
  }
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return Number.isNaN(day.getTime()) ? value : DAY.format(day)
}

/** A calendar date with no time of day (see {@link formatDateOnly}). */
export function DateOnly(props: { readonly value: string }) {
  return <time dateTime={props.value}>{formatDateOnly(props.value)}</time>
}
