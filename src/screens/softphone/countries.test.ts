import { expect, test } from 'bun:test'
import { buildE164 } from './countries'

test('a national number with its trunk zero still builds the E.164 string', () => {
  expect(buildE164('GB', '020 7946 0958')).toBe('+442079460958')
  expect(buildE164('US', '(555) 010-0100')).toBe('+15550100100')
  expect(buildE164('US', '')).toBe('')
})
