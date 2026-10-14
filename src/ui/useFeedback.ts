import { useCallback, useEffect, useState } from 'react'

/**
 * The one success message of a screen, and a counter that moves on every new success. A form that
 * fails calls `failed()` so a success from earlier does not stay beside the error; a row calls
 * `useClearOnSuccess(serial, ...)` so an error from earlier goes when something else succeeds.
 */
export function useFeedback() {
  const [state, setState] = useState({ notice: '', serial: 0 })
  const done = useCallback(
    (notice: string) => setState((now) => ({ notice, serial: now.serial + 1 })),
    []
  )
  const failed = useCallback(
    () => setState((now) => (now.notice === '' ? now : { ...now, notice: '' })),
    []
  )
  return { notice: state.notice, serial: state.serial, done, failed }
}

/** Runs `clear` when `serial` changes (a later success elsewhere on the screen), not on first render. */
export function useClearOnSuccess(serial: number, clear: () => void) {
  const [seen, setSeen] = useState(serial)
  useEffect(() => {
    if (seen !== serial) {
      setSeen(serial)
      clear()
    }
  }, [seen, serial, clear])
}
