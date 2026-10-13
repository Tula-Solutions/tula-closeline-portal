import { useEffect } from 'react'

/** Sets the tab title for the screen: "<title> - Closeline". */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} - Closeline`
  }, [title])
}
