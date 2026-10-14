const DATE = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** A timestamp as a readable local date and time; a value that is not a date is shown as it came. */
export function When(props: { readonly iso: string }) {
  const time = Date.parse(props.iso)
  return <time dateTime={props.iso}>{Number.isNaN(time) ? props.iso : DATE.format(time)}</time>
}
