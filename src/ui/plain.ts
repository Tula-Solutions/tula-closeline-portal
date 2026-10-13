/**
 * Code point ranges that are invisible or that reorder or hide text: soft hyphen, Arabic letter
 * mark, Hangul fillers, Mongolian vowel separator, zero-width and direction marks, line and
 * paragraph separators, direction embeddings, isolates and invisible operators, the Hangul filler
 * U+3164, variation selectors, the byte order mark, half-width Hangul filler, and tag characters.
 * C0/C1 controls are matched by `\p{Cc}`. Written as numbers so no invisible character sits in this file.
 */
const RANGES: readonly (readonly [number, number])[] = [
  [0x00ad, 0x00ad],
  [0x061c, 0x061c],
  [0x115f, 0x1160],
  [0x180e, 0x180e],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x206f],
  [0x3164, 0x3164],
  [0xfe00, 0xfe0f],
  [0xfeff, 0xfeff],
  [0xffa0, 0xffa0],
  [0xe0000, 0xe007f],
  [0xe0100, 0xe01ef],
]

const hex = (code: number) => `\\u{${code.toString(16)}}`
const INVISIBLE = new RegExp(
  `[\\p{Cc}${RANGES.map(([from, to]) => `${hex(from)}-${hex(to)}`).join('')}]`,
  'gu'
)

/**
 * Text for an attribute such as `aria-label`: the visible characters of an untrusted name, none
 * that reorder or hide. When nothing visible is left, `fallback` (cleaned the same way) stands in.
 */
export function plain(text: string, fallback = ''): string {
  const clean = text.replace(INVISIBLE, '').trim()
  return clean === '' ? fallback.replace(INVISIBLE, '').trim() : clean
}
