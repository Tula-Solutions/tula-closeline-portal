import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Button } from '~/components/ui/button'

/**
 * A button that asks before it acts. Opening moves focus to Cancel (the safe choice); Escape or
 * Cancel returns it to the button; confirming closes the question and leaves focus on the button,
 * which shows `pendingLabel` until the action settles.
 */
export function Confirm(props: {
  readonly label: string
  readonly accessibleName: string
  /** The trigger's name while the action runs, so it matches its visible text. */
  readonly pendingAccessibleName: string
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
      <Button
        type='button'
        variant='outline'
        size='sm'
        ref={trigger}
        aria-label={props.pending ? props.pendingAccessibleName : props.accessibleName}
        aria-describedby={props.describedBy}
        aria-disabled={props.pending}
        onClick={() => {
          if (!props.pending) {
            setOpen(true)
          }
        }}
      >
        {props.pending ? props.pendingLabel : props.label}
      </Button>
    )
  }
  return (
    <fieldset
      className='confirm flex min-w-56 flex-col gap-3 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning'
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          close()
        }
      }}
    >
      <legend className='sr-only'>{props.accessibleName}</legend>
      <p>{props.question}</p>
      <div className='flex flex-wrap gap-2'>
        <Button
          type='button'
          variant='destructive'
          size='sm'
          onClick={() => {
            props.onConfirm()
            close()
          }}
        >
          {props.confirmLabel}
        </Button>
        <Button type='button' variant='outline' size='sm' ref={cancel} onClick={close}>
          Cancel
        </Button>
      </div>
    </fieldset>
  )
}
