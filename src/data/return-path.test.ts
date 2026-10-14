import { describe, expect, test } from 'bun:test'
import { parseReturnPath } from '~/data/return-path'

describe('parseReturnPath', () => {
  test.each([
    ['/sales-history/deals', '/sales-history/deals'],
    ['/sales-history/calls?deal=deal_abc', '/sales-history/calls?deal=deal_abc'],
    ['/teams', '/teams'],
  ])('%s is kept', (value, expected) => {
    expect(parseReturnPath(value)).toBe(expected)
  })

  test.each([
    [undefined],
    [null],
    [42],
    [''],
    ['teams'],
    ['//evil.example'],
    ['/\\evil.example'],
    ['https://evil.example/'],
    ['javascript:alert(1)'],
    ['/a\nb'],
    ['/sign-in'],
    ['/sign-up?x=1'],
    ['/' + 'a'.repeat(600)],
  ])('%p is dropped', (value) => {
    expect(parseReturnPath(value)).toBeUndefined()
  })
})
