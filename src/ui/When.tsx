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

/**
 * A date that has no time of day (a Deal's closing date) as its UTC calendar date, such as
 * "Jan 31, 2026". Core keeps these as a UTC timestamp, so the date is read in UTC: a reader's
 * time zone must not move it to the day before. Other timestamps use {@link formatWhen}.
 */
export function formatDateOnly(value: string): string {
  const time = Date.parse(value)
  return Number.isNaN(time) ? value : DAY.format(time)
}

/** A date with no time of day (see {@link formatDateOnly}). A CSV `closed_at` given with an offset is stored as a UTC instant, so its UTC date can differ from the one typed: that needs a date-only `closedAt` in the contract. */
export function DateOnly(props: { readonly value: string }) {
  return <time dateTime={props.value}>{formatDateOnly(props.value)}</time>
}
