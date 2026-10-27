import type { ReactNode } from 'react'

/** Short, common words that would mark half of any passage. */
const STOP = new Set(
  "the and for are but not you your yours our ours with that this have has had was were will would can could should from they them their there what when where which who how why about into than then just also its it’s it's been being does did doing very more most some any all out over only own same too".split(
    ' '
  )
)

/**
 * The words of a search worth marking in its results: letters and digits only, three or more
 * characters, lower-cased, without common words, at most 24. Search is by meaning, so these marks
 * only show where the same words recur; they never decide what matched.
 */
export function searchTerms(texts: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  for (const text of texts) {
    for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
      if ([...word].length >= 3 && !STOP.has(word)) {
        seen.add(word)
      }
      if (seen.size >= 24) {
        return [...seen]
      }
    }
  }
  return [...seen]
}

function literal(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Untrusted result text with the search's words wrapped in <mark>. It only splits the string and
 * renders text nodes, never markup. A word is marked where it starts a word in the text, so
 * "price" marks "pricing" but not "caprice".
 */
export function Highlight(props: { readonly text: string; readonly terms: readonly string[] }) {
  if (props.terms.length === 0 || props.text === '') {
    return <>{props.text}</>
  }
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(${[...props.terms]
      .sort((a, b) => b.length - a.length)
      .map(literal)
      .join('|')})`,
    'giu'
  )
  const parts: ReactNode[] = []
  let last = 0
  for (const match of props.text.matchAll(pattern)) {
    const at = match.index ?? 0
    if (at > last) {
      parts.push(props.text.slice(last, at))
    }
    parts.push(<mark key={at}>{match[0]}</mark>)
    last = at + match[0].length
  }
  if (last < props.text.length) {
    parts.push(props.text.slice(last))
  }
  return <>{parts}</>
}
