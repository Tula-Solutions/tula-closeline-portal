import { type ReactNode, useEffect, useState } from 'react'

/** How long a button says "Saved" after its save succeeds. */
export const SAVED_MS = 1600

/**
 * A form's save button that answers a successful save in place: for 1.6 s it reads "Saved" beside a
 * check that draws itself, then goes back to its label. The label stays in the button (hidden from
 * sight, not from assistive technology), so its width and its accessible name never change; the
 * form's status line is what announces the save. `savedAt` is a new number each time a save
 * succeeds (a counter or a time); 0 means none yet.
 */
export function SaveButton(props: {
  readonly pending: boolean
  readonly savedAt: number
  readonly pendingLabel: string
  readonly children: ReactNode
}) {
  const [showing, setShowing] = useState(false)
  useEffect(() => {
    if (props.savedAt === 0) {
      return undefined
    }
    setShowing(true)
    const timer = setTimeout(() => setShowing(false), SAVED_MS)
    return () => clearTimeout(timer)
  }, [props.savedAt])
  const saved = showing && !props.pending
  return (
    <button
      type='submit'
      className='button relative'
      aria-disabled={props.pending}
      data-saved={saved ? '' : undefined}
    >
      <span className={saved ? 'opacity-0' : undefined}>
        {props.pending ? props.pendingLabel : props.children}
      </span>
      {saved ? (
        <span
          aria-hidden='true'
          className='absolute inset-0 flex items-center justify-center gap-1.5'
        >
          <svg
            aria-hidden='true'
            viewBox='0 0 16 16'
            className='check-draw size-4'
            fill='none'
            stroke='currentColor'
          >
            <path d='M3 8.5l3.2 3L13 4.5' pathLength='1' strokeWidth='2' strokeLinecap='round' />
          </svg>
          Saved
        </span>
      ) : null}
    </button>
  )
}
