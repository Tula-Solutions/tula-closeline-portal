import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FIGURE_ALLOWLIST } from '~/marketing/copy/figures'
import { checkCopy, collectStrings, parseGlossary } from '~/marketing/copy-guard'

// The portal keeps a synced copy of the glossary at its root; the guard reads that one.
const glossary = parseGlossary(readFileSync(new URL('../../GLOSSARY.md', import.meta.url), 'utf8'))
const COPY_DIR = new URL('./copy/', import.meta.url).pathname
// `figures.ts` is the allowlist, not copy.
const COPY_FILES = readdirSync(COPY_DIR).filter(
  (name) => name.endsWith('.ts') && name !== 'figures.ts'
)

describe('the glossary reader', () => {
  test('reads the defined terms and the words to avoid, without the parenthetical', () => {
    expect(glossary.canonical).toContain('Contact Consent')
    expect(glossary.canonical).toContain('Prospect')
    const words = glossary.avoid.map((entry) => entry.word)
    expect(words).toContain('lead')
    expect(words).toContain('SDR')
    expect(words).toContain('status')
    expect(words.some((word) => word.includes('('))).toBe(false)
  })
})

describe('the copy guard catches what it is for', () => {
  const run = (text: string) => checkCopy([text], glossary, FIGURE_ALLOWLIST)

  test('an emoji', () => {
    expect(run('Close deals faster \u{1F680}').map((v) => v.rule)).toEqual(['emoji'])
    expect(run('Done ❤️').some((v) => v.rule === 'emoji')).toBe(true)
  })

  test('"lead" used for a Prospect', () => {
    const found = run('Qualify every lead the moment it arrives.')
    expect(found.map((v) => [v.rule, v.match])).toEqual([['avoided-term', 'lead']])
  })

  test('an unsourced "98%"', () => {
    const found = run('98% of Reps close more.')
    expect(found.map((v) => [v.rule, v.match])).toEqual([['unsourced-figure', '98%']])
    expect(run('Three times faster, 3x.').some((v) => v.rule === 'unsourced-figure')).toBe(true)
  })

  test('a figure with a source in the allowlist passes', () => {
    const allowed = [{ figure: '98%', source: 'a measurement we can show' }]
    expect(checkCopy(['98% of runs.'], glossary, allowed)).toEqual([])
  })

  test.each([
    ['customer', 'Our customers close more.'],
    ['workspace', 'Open your workspace.'],
    ['bot', 'A bot that sells.'],
    ['SDR', 'Replaces an SDR.'],
    ['contact', 'Add a contact to the list.'],
  ])('the avoided word %s', (_word, text) => {
    expect(run(text).some((v) => v.rule === 'avoided-term')).toBe(true)
  })

  test('the glossary terms themselves are allowed as defined', () => {
    expect(
      run('A Contact Consent for the Prospect before the Inbound Agent or Outbound Agent acts.')
    ).toEqual([])
    // The lower-case word is not the term.
    expect(run('Ask for contact consent.').some((v) => v.rule === 'avoided-term')).toBe(true)
  })

  test('an ordinary x or percent sign that is not a figure passes', () => {
    expect(run('Phase 2 of 4. Box x, extra, 10 per month.')).toEqual([])
  })
})

describe('the marketing copy itself', () => {
  test('there is copy to check', () => {
    expect(COPY_FILES.length).toBeGreaterThan(1)
  })

  test.each(COPY_FILES.map((name) => [name]))(
    '%s has no emoji, avoided term or unsourced figure',
    async (name) => {
      const module = (await import(join(COPY_DIR, name))) as Record<string, unknown>
      const strings = collectStrings(Object.values(module))
      expect(strings.length).toBeGreaterThan(0)
      expect(checkCopy(strings, glossary, FIGURE_ALLOWLIST)).toEqual([])
    }
  )

  test('every allowed figure names its source', () => {
    for (const entry of FIGURE_ALLOWLIST) {
      expect(entry.source.trim().length).toBeGreaterThan(0)
    }
  })

  test('the components hold no sentences of their own: copy lives in the copy modules', () => {
    const files = readdirSync(new URL('./', import.meta.url).pathname).filter((name) =>
      name.endsWith('.tsx')
    )
    expect(files.length).toBeGreaterThan(0)
    for (const name of files.filter((file) => !file.endsWith('.test.tsx'))) {
      const source = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
      // Text between a closing `>` and the next `<` that has a letter and is not an expression.
      const text = source.match(/>\s*[A-Za-z][^<>{}=]*</g)
      expect(text === null ? [] : text.map((hit) => `${name}: ${hit}`)).toEqual([])
    }
  })
})

describe('terms a decision record proposes', () => {
  test('Contact Check is allowed as written, but a lower-case contact is not', () => {
    const run = (text: string) => checkCopy([text], glossary, FIGURE_ALLOWLIST)
    expect(run('A Contact Check runs first.')).toEqual([])
    expect(run('We contact the buyer.').map((v) => v.rule)).toEqual(['avoided-term'])
  })
})
