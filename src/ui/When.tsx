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
