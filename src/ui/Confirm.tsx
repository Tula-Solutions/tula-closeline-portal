import { type ReactNode, useEffect, useRef, useState } from 'react'

/**
 * A button that asks before it acts. Opening moves focus to Cancel (the safe choice); Escape or
 * Cancel returns it to the button; confirming closes the question and leaves focus on the button,
 * which shows `pendingLabel` until the action settles.
 */
export function Confirm(props: {
  readonly label: string
  readonly accessibleName: string
  readonly pendingLabel: string
  readonly question: ReactNode
  readonly confirmLabel: string
  readonly pending: boolean
  readonly onConfirm: () => void
  readonly describedBy?: string | undefined
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const restore = useRef(false)
  useEffect(() => {
    if (open) {
      cancel.current?.focus()
    } else if (restore.current) {
      restore.current = false
      trigger.current?.focus()
    }
  }, [open])
  const close = () => {
    restore.current = true
    setOpen(false)
  }
  if (!open) {
    return (
      <button
        type='button'
        ref={trigger}
        className='button button-quiet'
        aria-label={props.accessibleName}
        aria-describedby={props.describedBy}
        aria-disabled={props.pending}
        onClick={() => {
          if (!props.pending) {
            setOpen(true)
          }
        }}
      >
        {props.pending ? props.pendingLabel : props.label}
      </button>
    )
  }
  return (
    <fieldset
      className='confirm'
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          close()
        }
      }}
    >
      <legend className='sr-only'>{props.accessibleName}</legend>
      <p>{props.question}</p>
      <button
        type='button'
        className='button'
        onClick={() => {
          props.onConfirm()
          close()
        }}
      >
        {props.confirmLabel}
      </button>{' '}
      <button type='button' ref={cancel} className='button button-quiet' onClick={close}>
        Cancel
      </button>
    </fieldset>
  )
}
