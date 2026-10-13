import { useRef } from 'react'
import { createKeyHolder, type KeyHolder } from '~/api/idempotency'

/** One key holder for the life of a form or row. */
export function useKeyHolder(): KeyHolder {
  const ref = useRef<KeyHolder | null>(null)
  if (ref.current === null) {
    ref.current = createKeyHolder()
  }
  return ref.current
}
