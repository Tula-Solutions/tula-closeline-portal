/**
 * The marketing copy guard: finds emoji, words the glossary says to avoid, roadmap and decision-record wording, and unsourced figures in
 * the strings of the copy modules. Pure functions, so a fixture can prove each rule catches.
 */

/** One thing wrong with one string of copy. */
export interface CopyViolation {
  readonly rule: 'emoji' | 'avoided-term' | 'unsourced-figure' | 'internal-reference'
  readonly match: string
  readonly text: string
}

/** The glossary read for the guard: its canonical terms and the words it says to avoid. */
export interface GlossaryTerms {
  /** The defined terms (`**Prospect**`), which are allowed in copy exactly as capitalised. */
  readonly canonical: readonly string[]
  /** Each avoided word with the term it is avoided for. */
  readonly avoid: readonly { readonly word: string; readonly instead: string }[]
}

/**
 * Terms a decision record proposes and the glossary does not yet define. The copy may use them
 * exactly as written; remove an entry once the glossary has it.
 */
export const PENDING_TERMS: readonly string[] = ['Contact Check'] // ADR 0021 (proposed)

/** Reads the canonical terms and the `_Avoid_` lists out of GLOSSARY.md. */
export function parseGlossary(markdown: string): GlossaryTerms {
  const canonical: string[] = []
  const avoid: { word: string; instead: string }[] = []
  let current = ''
  for (const line of markdown.split('\n')) {
    const term = /^\*\*(.+?)\*\*:\s*$/.exec(line)
    if (term?.[1] !== undefined) {
      current = term[1]
      canonical.push(current)
      continue
    }
    const avoided = /^_Avoid_:\s*(.+)$/.exec(line)
    if (avoided?.[1] !== undefined) {
      for (const entry of avoided[1].split(',')) {
        // "status (of a Deal)" is avoided as "status".
        const word = entry.replace(/\(.*?\)/g, '').trim()
        if (word !== '') {
          avoid.push({ word, instead: current })
        }
      }
    }
  }
  return { canonical, avoid }
}

/** Every string inside a copy value, however deeply it is nested. */
export function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value]
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectStrings)
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).flatMap(collectStrings)
  }
  return []
}

const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u{FE0F}|\u{200D}|\u{20E3}/u
/**
 * Roadmap and decision-record wording that is for the team, not the buyer: a phase number, an ADR
 * number, "built today", "planned" and "roadmap". A part that is not live is "Early access".
 */
const INTERNAL = /\bphase \d|\bADR[ -]?\d{2,4}|\bbuilt today\b|\bplanned\b|\broadmap\b/i
const FIGURE = /\d[\d,.]*\s?(?:%|x\b|×)/gi

function escapeWord(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Checks strings of copy against the glossary and the figure allowlist. A defined term is allowed
 * exactly as the glossary capitalises it ("Contact Consent"); the same word in lower case is not.
 */
export function checkCopy(
  strings: readonly string[],
  glossary: GlossaryTerms,
  allowedFigures: readonly { readonly figure: string }[]
): CopyViolation[] {
  const violations: CopyViolation[] = []
  // Longest first, so "Inbound Agent" is removed before "Agent".
  const canonical = [...glossary.canonical, ...PENDING_TERMS].sort((a, b) => b.length - a.length)
  const strip = new RegExp(`(?<![\\p{L}\\p{N}])(?:${canonical.map(escapeWord).join('|')})`, 'gu')
  const allowed = new Set(
    allowedFigures.map((entry) => entry.figure.toLowerCase().replace(/\s/g, ''))
  )
  for (const text of strings) {
    const emoji = EMOJI.exec(text)
    if (emoji !== null) {
      violations.push({ rule: 'emoji', match: emoji[0], text })
    }
    const internal = INTERNAL.exec(text)
    if (internal !== null) {
      violations.push({ rule: 'internal-reference', match: internal[0], text })
    }
    const plain = text.replace(strip, ' ')
    // A word avoided for two terms ("lead") is reported once.
    for (const word of new Set(glossary.avoid.map((entry) => entry.word.toLowerCase()))) {
      const found = new RegExp(
        `(?<![\\p{L}\\p{N}-])${escapeWord(word)}s?(?![\\p{L}\\p{N}-])`,
        'iu'
      ).exec(plain)
      if (found !== null) {
        violations.push({ rule: 'avoided-term', match: found[0], text })
      }
    }
    for (const figure of text.match(FIGURE) ?? []) {
      if (!allowed.has(figure.toLowerCase().replace(/\s/g, ''))) {
        violations.push({ rule: 'unsourced-figure', match: figure, text })
      }
    }
  }
  return violations
}
