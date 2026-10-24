import { describe, expect, test } from 'bun:test'
import {
  addDays,
  eachDay,
  isCalendarDay,
  presetRange,
  rangeProblem,
} from '~/screens/analytics/range'
import { analyticsFilter, mergeSearch, readAnalyticsSearch } from '~/screens/analytics/search'
import { hexId } from '~/testing/core-bodies'

describe('range', () => {
  test('a preset ends today and counts today as a day', () => {
    expect(presetRange(7, '2026-10-23')).toEqual({ from: '2026-10-17', to: '2026-10-23' })
    expect(eachDay('2026-10-17', '2026-10-23').length).toBe(7)
  })

  test('adding days crosses a month and a leap day', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  test('only a real calendar day counts', () => {
    expect(isCalendarDay('2026-02-30')).toBe(false)
    expect(isCalendarDay('26-10-01')).toBe(false)
    expect(isCalendarDay('2026-10-01')).toBe(true)
  })

  test('an end before the start, an empty date and more than 13 months are refused in words', () => {
    expect(rangeProblem('2026-10-05', '2026-10-01')).toMatch(/before/)
    expect(rangeProblem('', '2026-10-01')).not.toBeNull()
    expect(rangeProblem('2025-01-01', '2026-10-01')).toMatch(/13 months/)
    expect(rangeProblem('2026-09-01', '2026-10-01')).toBeNull()
  })
})

describe('search', () => {
  test('keeps valid values and drops the rest', () => {
    expect(
      readAnalyticsSearch({
        from: '2026-10-01',
        to: 'tomorrow',
        channel: 'email',
        agentKind: 'robot',
        campaignId: 'nope',
        repMembershipId: hexId('mem', 1),
      })
    ).toEqual({ from: '2026-10-01', channel: 'email', repMembershipId: hexId('mem', 1) })
  })

  test('merging removes a key set to undefined', () => {
    expect(mergeSearch({ channel: 'email', from: '2026-10-01' }, { channel: undefined })).toEqual({
      from: '2026-10-01',
    })
  })

  test('a Manager or Rep never sends Channel, Agent or Campaign, and a Rep never sends a Rep', () => {
    const search = {
      channel: 'email',
      agentKind: 'inbound',
      campaignId: hexId('cpg', 1),
      repMembershipId: hexId('mem', 2),
    } as const
    for (const role of ['manager', 'rep'] as const) {
      const filter = analyticsFilter(role, search, '2026-10-23')
      expect(filter.channel).toBeUndefined()
      expect(filter.agentKind).toBeUndefined()
      expect(filter.campaignId).toBeUndefined()
    }
    expect(analyticsFilter('manager', search, '2026-10-23').repMembershipId).toBe(hexId('mem', 2))
    expect(analyticsFilter('rep', search, '2026-10-23').repMembershipId).toBeUndefined()
    expect(analyticsFilter('admin', search, '2026-10-23').channel).toBe('email')
  })

  test('the default range is the last 30 days', () => {
    const filter = analyticsFilter('owner', {}, '2026-10-23')
    expect(filter).toEqual({ from: '2026-09-24', to: '2026-10-23' })
  })
})
