import { useEffect, useState } from 'react'

/**
 * A `blob:` address for `text` as a file, for a download link; null until it is made, and when the
 * browser cannot make one. The address is released when the text changes or the screen is left.
 */
export function useDownloadUrl(text: string, type = 'text/csv'): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (typeof URL.createObjectURL !== 'function') {
      return
    }
    const made = URL.createObjectURL(new Blob([text], { type }))
    setUrl(made)
    return () => {
      URL.revokeObjectURL(made)
    }
  }, [text, type])
  return url
}
