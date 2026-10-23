import { useEffect } from 'react'

/** What a marketing page tells the browser and a link preview about itself. */
export interface PageMeta {
  readonly title: string
  readonly description: string
  /** A path on this site to the share image. */
  readonly image: string
}

/** Finds the `<meta>` tag with this attribute, or adds it; returns it with the content it had. */
function metaTag(attribute: 'name' | 'property', key: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
  const created = tag === null
  if (tag === null) {
    tag = document.createElement('meta')
    tag.setAttribute(attribute, key)
    document.head.append(tag)
  }
  return { tag, created, before: tag.getAttribute('content') }
}

/**
 * Sets the tab title, the description and the Open Graph tags for the page, and puts back what was
 * there when the page goes away. The same tags are in `index.html` as the defaults a link preview
 * reads, since it does not run the script.
 */
export function usePageMeta(meta: PageMeta) {
  const { title, description, image } = meta
  useEffect(() => {
    const previousTitle = document.title
    document.title = title
    const entries = [
      metaTag('name', 'description'),
      metaTag('property', 'og:title'),
      metaTag('property', 'og:description'),
      metaTag('property', 'og:image'),
    ]
    const values = [description, title, description, image]
    entries.forEach((entry, index) => {
      entry.tag.setAttribute('content', values[index] ?? '')
    })
    return () => {
      document.title = previousTitle
      for (const entry of entries) {
        if (entry.created) {
          entry.tag.remove()
        } else if (entry.before !== null) {
          entry.tag.setAttribute('content', entry.before)
        }
      }
    }
  }, [title, description, image])
}
