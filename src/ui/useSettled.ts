import { useEffect, useState } from 'react'

/** How long typing must pause before a search is sent. */
export const SEARCH_PAUSE_MS = 250

/** The text as it was once typing paused for `SEARCH_PAUSE_MS`, so a search is not sent per key. */
export function useSettled(text: string): string {
  const [settled, setSettled] = useState(text)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(text), SEARCH_PAUSE_MS)
    return () => clearTimeout(timer)
  }, [text])
  return settled
}
