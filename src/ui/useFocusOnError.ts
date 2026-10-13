import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Moves focus to the first field marked invalid, or to the form's banner when no field is. Call
 * `focusFirstError()` after setting the errors; the focus moves once they are on screen.
 */
export function useFocusOnError() {
  const formRef = useRef<HTMLFormElement>(null)
  const bannerRef = useRef<HTMLDivElement>(null)
  const [request, setRequest] = useState(0)
  useEffect(() => {
    if (request === 0) {
      return
    }
    const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
    ;(invalid ?? bannerRef.current)?.focus()
  }, [request])
  const focusFirstError = useCallback(() => setRequest((count) => count + 1), [])
  return { formRef, bannerRef, focusFirstError }
}
