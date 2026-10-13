import { describe, expect, test } from 'bun:test'
import { failureWords, stateLabel, typeLabel } from '~/data/documents'

describe('labels for values a newer service may send', () => {
  test('known values have their own words', () => {
    expect(stateLabel('ready')).toBe('Ready')
    expect(typeLabel('application/pdf')).toBe('PDF')
    expect(failureWords('password_protected')).toMatch(/password/)
  })

  test('an unknown value gets a safe default, never undefined', () => {
    expect(stateLabel('archived')).toBe('Unknown status')
    expect(typeLabel('application/zip')).toBe('File')
    expect(failureWords('virus_found')).toMatch(/could not be processed/)
  })
})
