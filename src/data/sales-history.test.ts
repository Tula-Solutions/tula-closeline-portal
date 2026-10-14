import { describe, expect, test } from 'bun:test'
import {
  CURRENT_RIGHTS_WORDING_VERSION,
  checkDealImportHeaderText,
  DEAL_IMPORT_FAILURE_REASONS,
  DEAL_IMPORT_HEADER_PROBLEMS,
  DEAL_IMPORT_REQUIRED_COLUMNS,
  DEAL_IMPORT_ROW_REASONS,
  DEAL_IMPORT_STATES,
  MAX_CALL_SPEAKERS,
  OUTCOMES,
  rightsWordingFor,
} from 'tula-closeline-contract'
import {
  callFailureWords,
  callStateLabel,
  dealImportTemplate,
  HEADER_PROBLEM_WORDS,
  IMPORT_FAILURE_WORDS,
  IMPORT_STATE_LABEL,
  importFailureWords,
  importStateLabel,
  inSearchWords,
  OUTCOME_LABEL,
  outcomeLabel,
  parseBackPath,
  ROW_REASON_WORDS,
  rowReasonWords,
  SALES_POLL_SCHEDULE_MS,
} from '~/data/sales-history'

describe('words for contract values', () => {
  test('an interior blank line has its own words, and trailing blank lines need none', () => {
    expect(rowReasonWords('blank_row')).toMatch(/blank line/i)
    expect(rowReasonWords('blank_row')).not.toBe('The row was rejected.')
  })

  test('every Outcome, import state, failure, row reason and header problem has words', () => {
    for (const outcome of OUTCOMES) {
      expect(OUTCOME_LABEL[outcome]).toBeTruthy()
    }
    for (const state of DEAL_IMPORT_STATES) {
      expect(IMPORT_STATE_LABEL[state]).toBeTruthy()
    }
    for (const reason of DEAL_IMPORT_FAILURE_REASONS) {
      expect(IMPORT_FAILURE_WORDS[reason]).toBeTruthy()
    }
    for (const reason of DEAL_IMPORT_ROW_REASONS) {
      expect(ROW_REASON_WORDS[reason]).toBeTruthy()
    }
    for (const problem of DEAL_IMPORT_HEADER_PROBLEMS) {
      expect(HEADER_PROBLEM_WORDS[problem]).toBeTruthy()
    }
  })

  test('a value from a newer service gets a plain default, never its own text', () => {
    expect(outcomeLabel('paused')).toBe('Unknown')
    expect(importStateLabel('exploded')).toBe('Unknown status')
    expect(importFailureWords('toString')).toBe('The import failed. Upload the file again.')
    expect(rowReasonWords('constructor')).toBe('The row was rejected.')
  })
})

describe('the CSV template', () => {
  test('is accepted by the contract header check and has one example row', () => {
    const template = dealImportTemplate()
    expect(checkDealImportHeaderText(template).ok).toBe(true)
    const [header, example, end] = template.split('\r\n')
    expect(header?.split(',').slice(0, DEAL_IMPORT_REQUIRED_COLUMNS.length)).toEqual([
      ...DEAL_IMPORT_REQUIRED_COLUMNS,
    ])
    expect(example).toBeTruthy()
    expect(end).toBe('')
  })
})

describe('polling and the way back', () => {
  test('the first wait is at least three seconds and none is shorter than the one before', () => {
    expect(SALES_POLL_SCHEDULE_MS[0]).toBeGreaterThanOrEqual(3_000)
    SALES_POLL_SCHEDULE_MS.forEach((wait, index) => {
      expect(wait).toBeGreaterThanOrEqual(SALES_POLL_SCHEDULE_MS[index - 1] ?? 0)
    })
  })

  test('only this section is a way back', () => {
    expect(parseBackPath('/sales-history/imports')).toBe('/sales-history/imports')
    for (const bad of [
      'https://evil.example/',
      '//evil.example',
      '/members',
      '/sales-history/deals/x',
      3,
      undefined,
    ]) {
      expect(parseBackPath(bad)).toBeUndefined()
    }
  })
})

describe('the rights wording', () => {
  test('version 1 exists, a version this build lacks does not, and prototype names are not versions', () => {
    expect(rightsWordingFor(CURRENT_RIGHTS_WORDING_VERSION)).toBeDefined()
    expect(rightsWordingFor(CURRENT_RIGHTS_WORDING_VERSION + 1)).toBeUndefined()
    expect(rightsWordingFor(Number.NaN)).toBeUndefined()
  })
})

describe('words for Calls', () => {
  test("the speaker limit in the words is the contract's", () => {
    expect(callFailureWords('too_many_speakers')).toContain(
      `more than ${MAX_CALL_SPEAKERS} speakers`
    )
  })

  test('a reason or state from a newer service gets a plain sentence, never its own text', () => {
    expect(callFailureWords('toString')).toMatch(/did not finish/)
    expect(callStateLabel('constructor')).toBe('Unknown status')
  })

  test('a Call in search says so, and one out of search says why', () => {
    expect(inSearchWords({ inSearch: true, state: 'ready', dealOutcome: 'won' })).toBe('In search')
    expect(inSearchWords({ inSearch: false, state: 'deleted', dealOutcome: 'won' })).toMatch(
      /deleted/
    )
  })
})
