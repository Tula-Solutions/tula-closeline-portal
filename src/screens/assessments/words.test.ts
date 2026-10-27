import { describe, expect, test } from 'bun:test'
import { idTail, quoteSpan } from '~/screens/assessments/words'

describe('quoteSpan', () => {
  const body = 'Thanks for the reply. We guarantee a 40% saving. Talk Thursday?'

  test('quotes the characters the span names', () => {
    expect(quoteSpan(body, { start: 22, end: 48 })).toBe('We guarantee a 40% saving.')
  })

  test.each([
    ['an empty span', { start: 5, end: 5 }],
    ['a backwards span', { start: 9, end: 3 }],
    ['a span before the text', { start: -1, end: 4 }],
    ['a span past the end (the Draft was edited since)', { start: 40, end: 400 }],
    ['a span of only spaces', { start: 21, end: 22 }],
  ])('gives nothing for %s', (_name, span) => {
    expect(quoteSpan(body, span)).toBeNull()
  })
})

describe('idTail', () => {
  test('shortens a long id and keeps a short one', () => {
    expect(idTail('drf_00000000000000000000000000000abc')).toBe('…00000abc')
    expect(idTail('short')).toBe('short')
  })
})
