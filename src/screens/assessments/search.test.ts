import { describe, expect, test } from 'bun:test'
import {
  assessmentFilter,
  datesProblem,
  mergeAssessmentSearch,
  rateRange,
  readAssessmentSearch,
} from '~/screens/assessments/search'

describe('readAssessmentSearch', () => {
  test('keeps valid values and drops the rest', () => {
    expect(
      readAssessmentSearch({
        verdict: 'fail',
        category: 'tone',
        agentKind: 'inbound',
        from: '2026-10-01',
        to: '2026-10-07',
      })
    ).toEqual({
      verdict: 'fail',
      category: 'tone',
      agentKind: 'inbound',
      from: '2026-10-01',
      to: '2026-10-07',
    })
    expect(
      readAssessmentSearch({ verdict: 'bad', category: 'x', agentKind: 1, from: '2026-02-30' })
    ).toEqual({})
  })

  test('a key set to undefined is removed when merging', () => {
    expect(
      mergeAssessmentSearch({ verdict: 'fail', agentKind: 'inbound' }, { verdict: undefined })
    ).toEqual({ agentKind: 'inbound' })
  })
})

describe('dates', () => {
  test('an end before the start is a problem and never reaches the call', () => {
    const search = { from: '2026-10-07', to: '2026-10-01' }
    expect(datesProblem(search)).not.toBeNull()
    const filter = assessmentFilter(search)
    expect(filter.from).toBeUndefined()
    expect(filter.to).toBeUndefined()
  })

  test('the chart reads the address range, or the last 12 weeks when it is not usable', () => {
    expect(rateRange({ from: '2026-10-01', to: '2026-10-07' }, '2026-10-26')).toEqual({
      from: '2026-10-01',
      to: '2026-10-07',
    })
    expect(rateRange({}, '2026-10-26')).toEqual({ from: '2026-08-04', to: '2026-10-26' })
    expect(rateRange({ from: '2024-01-01', to: '2026-10-07' }, '2026-10-26').to).toBe('2026-10-26')
  })
})
