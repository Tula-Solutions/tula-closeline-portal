import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'

const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8')
const button = readFileSync(new URL('./components/ui/button.tsx', import.meta.url), 'utf8')

type Rgba = { r: number; g: number; b: number; a: number }

/** The declarations of the first rule whose selector is exactly `selector`, after `from`. */
function block(selector: string, from = 0): Record<string, string> {
  const start = css.indexOf(`${selector} {`, from)
  if (start === -1) {
    return {}
  }
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  const out: Record<string, string> = {}
  for (const match of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    out[match[1] as string] = (match[2] as string).trim()
  }
  return out
}

function parse(value: string): Rgba {
  const hex = value.match(/^#([0-9a-f]{6})$/i)?.[1]
  if (hex) {
    const n = Number.parseInt(hex, 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
  }
  const rgb = value.match(/^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/)
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: Number(rgb[4] ?? 1) }
  }
  throw new Error(`Not a colour: ${value}`)
}

function over(top: Rgba, under: Rgba): Rgba {
  const mix = (t: number, u: number) => t * top.a + u * (1 - top.a)
  return { r: mix(top.r, under.r), g: mix(top.g, under.g), b: mix(top.b, under.b), a: 1 }
}

function luminance(c: Rgba): number {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
}

function ratio(fg: Rgba, bg: Rgba): number {
  const [hi, lo] = [luminance(over(fg, bg)), luminance(bg)].sort((x, y) => y - x) as [
    number,
    number,
  ]
  return (hi + 0.05) / (lo + 0.05)
}

const light = block(':root')
const dark = block('.dark')
const contrastAt = css.indexOf('@media (prefers-contrast: more)')
const moreLight = block(':root', contrastAt)
const moreDark = block('.dark', contrastAt)

const themes = [
  ['light', light],
  ['dark', dark],
] as const

describe('theme tokens', () => {
  test.each(themes)('the at-rest link underline is 3:1 or more on the page (%s)', (_, t) => {
    const bg = parse(t['--background'] as string)
    expect(ratio(parse(t['--border-strong'] as string), bg)).toBeGreaterThanOrEqual(3)
  })

  test.each(themes)('field edges are 3:1 or more on the page (%s)', (_, t) => {
    const bg = parse(t['--background'] as string)
    expect(ratio(parse(t['--input'] as string), bg)).toBeGreaterThanOrEqual(3)
  })

  test.each(themes)('a destructive text action is underlined at 3:1 or more (%s)', (_, t) => {
    const alpha = Number(button.match(/var\(--destructive\)_(\d+)%/)?.[1] ?? 100) / 100
    const red = { ...parse(t['--destructive'] as string), a: alpha }
    expect(ratio(red, parse(t['--background'] as string))).toBeGreaterThanOrEqual(3)
  })

  test('more contrast raises the underline and the field edge in both themes', () => {
    for (const [base, more] of [
      [light, moreLight],
      [dark, moreDark],
    ] as const) {
      const bg = parse(base['--background'] as string)
      for (const token of ['--border-strong', '--input']) {
        expect(more[token]).toBeDefined()
        expect(ratio(parse(more[token] as string), bg)).toBeGreaterThan(
          ratio(parse(base[token] as string), bg)
        )
      }
    }
  })
})

describe('focus and paper', () => {
  test('no source hides the outline outright, so forced-colours mode keeps a focus outline', () => {
    const found: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = `${dir}/${name}`
        if (statSync(path).isDirectory()) {
          walk(path)
        } else if (/\.(tsx?|css)$/.test(name) && !name.endsWith('.test.ts')) {
          if (readFileSync(path, 'utf8').includes('outline-none')) {
            found.push(path)
          }
        }
      }
    }
    walk(new URL('.', import.meta.url).pathname.replace(/\/$/, ''))
    expect(found).toEqual([])
  })

  test('the grain is the page background, not a layer over the content, and is off under more contrast', () => {
    expect(css).not.toContain('body::before')
    expect(light['--grain']).toContain('/paper-grain.svg')
    expect(dark['--grain']).toContain('/paper-grain-dark.svg')
    expect(moreLight['--grain']).toBe('none')
    expect(moreDark['--grain']).toBe('none')
    expect(css).toMatch(/body\s*\{[^}]*background-image:\s*var\(--grain\)/)
  })
})

describe('links and placeholders', () => {
  const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
  const rule = (selector: string) => {
    const start = styles.indexOf(`${selector} {`)
    return start === -1 ? '' : styles.slice(start, styles.indexOf('}', start))
  }

  test('an ink link is underlined at rest by its own layer, so it reads as a link before hover', () => {
    const link = styles.slice(styles.indexOf('.ink-link,'), styles.indexOf('.ink-link:hover'))
    expect(link).toMatch(/linear-gradient\(var\(--ink-rest, var\(--border-strong\)\)/)
    expect(link).toMatch(/box-decoration-break: clone/)
  })

  test('forced colours fall back to a real underline', () => {
    const forced = styles.slice(styles.indexOf('@media (forced-colors: active)'))
    expect(forced).toMatch(/\.ink-link[\s\S]*?text-decoration: underline/)
  })

  test('a skeleton is a still fill at rest; the shimmer waits 150 ms and only runs for motion', () => {
    expect(rule('  .skeleton')).not.toMatch(/animation/)
    const motion = styles.slice(styles.indexOf('@media (prefers-reduced-motion: no-preference)'))
    expect(motion).toMatch(/skeleton-wait 150ms[\s\S]*?shimmer 1\.4s linear 150ms infinite/)
  })
})

describe('motion under reduced motion', () => {
  const reduced = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)]
    .map((match) => match[1])
    .join('\n')

  test('CSS animations and transitions collapse, delays included, so nothing waits hidden', () => {
    expect(reduced).toMatch(/animation-duration:\s*0\.01ms/)
    expect(reduced).toMatch(/animation-delay:\s*0ms/)
    expect(reduced).toMatch(/transition-duration:\s*0\.01ms/)
  })

  test('every view-transition animation is declared only for people who did not ask for less motion', () => {
    const outside = css.replace(
      /@media \(prefers-reduced-motion: (?:reduce|no-preference)\) \{[\s\S]*?\n\}/g,
      ''
    )
    expect(outside).not.toMatch(/::view-transition-/)
  })

  test('the view-transition pseudo-elements, which the universal rule misses, are stopped too', () => {
    expect(reduced).toMatch(
      /::view-transition-group\(\*\),\s*::view-transition-old\(\*\),\s*::view-transition-new\(\*\)\s*\{\s*animation:\s*none;/
    )
  })
})
