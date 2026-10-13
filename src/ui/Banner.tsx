import type { ReactNode, Ref } from 'react'

/** A message for the whole form: an alert for a failure, a status for good news. Focusable so it can be read at once. */
export function Banner(props: {
  readonly kind: 'error' | 'info'
  readonly children: ReactNode
  readonly innerRef?: Ref<HTMLDivElement>
}) {
  return (
    <div
      className={`banner banner-${props.kind}`}
      role={props.kind === 'error' ? 'alert' : 'status'}
      tabIndex={-1}
      ref={props.innerRef}
    >
      {props.kind === 'error' ? <strong>Error: </strong> : null}
      {props.children}
    </div>
  )
}
