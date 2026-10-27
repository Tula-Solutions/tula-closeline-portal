import { describe, expect, test } from 'bun:test'
import type { AssessmentRateItem } from 'tula-closeline-contract'
import { pickWeek } from '~/screens/assessments/FailureRateChart'

function item(instructionVersion: number, ok: boolean): AssessmentRateItem {
  const base = {
    kind: 'rate',
    category: null,
    week: '2026-W40',
    weekStart: '2026-09-28',
    agentKind: 'inbound',
    instructionVersion,
  } as const
  return ok
    ? { ...base, state: 'ok', value: 0.1, recordCount: 30 }
    : { ...base, state: 'not_enough_data', value: null, recordCount: 5 }
}

describe('pickWeek', () => {
  test('prefers the newest version that states a rate over a newer thin one', () => {
    expect(pickWeek([item(1, true), item(2, false)], '2026-W40')?.instructionVersion).toBe(1)
  })
  test('takes the newest version when all state a rate or none do', () => {
    expect(pickWeek([item(1, true), item(2, true)], '2026-W40')?.instructionVersion).toBe(2)
    expect(pickWeek([item(1, false), item(2, false)], '2026-W40')?.instructionVersion).toBe(2)
  })
})
