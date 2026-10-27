import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { ASSESSMENT_ERRORS, IDEMPOTENCY_KEY_HEADER } from 'tula-closeline-contract'
import { draftBody, hexId, page } from '~/testing/core-bodies'
import { type Call, failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'
import { choose } from '~/testing/select'

const LIST = '/v1/assessments'
const RATES = '/v1/assessment-rates'

type Role = 'owner' | 'admin' | 'manager' | 'rep'

function visit(role: Role, url: string, ...handlers: Handler[]) {
  return renderPortal({
    url,
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers,
  })
}

function query(call: Call): URLSearchParams {
  return new URL(call.url, 'http://x.test').searchParams
}

function finding(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: hexId('fnd', n),
    category: 'unsupported_claim',
    severity: 'high',
    span: { start: 22, end: 48 },
    explanation: 'No Source supports a 40% saving.',
    feedback: null,
    ...overrides,
  }
}

function assessment(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: hexId('asm', n),
    subject: { kind: 'draft', draftId: hexId('drf', n) },
    prospectId: null,
    agentKind: 'outbound',
    instructionVersion: 3,
    verdict: 'fail',
    findings: [finding(n)],
    createdAt: '2026-10-05T10:00:00.000Z',
    ...overrides,
  }
}

function rate(
  week: number,
  agentKind: string,
  value: number | null,
  recordCount: number,
  category: string | null = null
) {
  const base = {
    kind: 'rate',
    week: `2026-W${String(week).padStart(2, '0')}`,
    weekStart: `2026-09-${String(week - 31 + 6).padStart(2, '0')}`,
    agentKind,
    instructionVersion: 3,
    category,
    recordCount,
  }
  return value === null
    ? { ...base, state: 'not_enough_data', value: null }
    : { ...base, state: 'ok', value }
}

const rates: Handler = route('GET', RATES, (call) =>
  json(200, {
    from: query(call).get('from'),
    to: query(call).get('to'),
    items:
      query(call).get('groupBy') === 'category'
        ? [
            rate(37, 'outbound', 0.03, 40, 'unsupported_claim'),
            rate(37, 'outbound', null, 12, 'tone'),
            rate(38, 'outbound', 0.06, 50, 'unsupported_claim'),
            rate(38, 'outbound', 0.01, 50, 'tone'),
            rate(37, 'inbound', 0.02, 30, 'missing_disclosure'),
          ]
        : [
            rate(37, 'outbound', 0.05, 40),
            rate(38, 'outbound', 0.1, 50),
            rate(39, 'outbound', null, 7),
            rate(37, 'inbound', 0.02, 30),
          ],
    nextCursor: null,
  })
)

const list: Handler = route(
  'GET',
  LIST,
  json(
    200,
    page([
      assessment(1),
      assessment(2, {
        subject: { kind: 'call_turn', callId: hexId('call', 2), turnIndex: 4 },
        agentKind: 'inbound',
        verdict: 'warn',
        findings: [finding(2, { category: 'tone', severity: 'low', feedback: 'false_alarm' })],
      }),
    ])
  )
)

const draft: Handler = route(
  'GET',
  `/v1/drafts/${hexId('drf', 1)}`,
  json(
    200,
    draftBody(1, { body: 'Thanks for the reply. We guarantee a 40% saving. Talk Thursday?' })
  )
)

let dark = false
beforeEach(() => {
  dark = document.documentElement.classList.contains('dark')
})
afterEach(() => {
  document.documentElement.classList.toggle('dark', dark)
})

describe('Assessments review', () => {
  test.each(['manager', 'rep'] as const)(
    'a %s sees a notice, no navigation entry and makes no request',
    async (role) => {
      const portal = visit(role, '/assessments', list, rates)
      expect(await screen.findByRole('heading', { name: 'Not allowed' })).toBeTruthy()
      expect(screen.queryByRole('link', { name: 'Assessments' })).toBeNull()
      expect(portal.calls.some((call) => call.path === LIST || call.path === RATES)).toBe(false)
    }
  )

  test.each(['owner', 'admin'] as const)('an %s has the entry and the review', async (role) => {
    visit(role, '/analytics', list, rates)
    expect(await screen.findByRole('link', { name: 'Assessments' })).toBeTruthy()
  })

  test('lists flagged assessments in words, worst first, asking for one bounded page', async () => {
    const portal = visit('owner', '/assessments', list, rates, draft)
    const entries = await screen.findAllByRole('listitem', { name: '' })
    expect(entries.length).toBeGreaterThan(0)
    expect(await screen.findByText('Unsupported claim, serious.')).toBeTruthy()
    expect(screen.getByText('Tone, minor.')).toBeTruthy()
    expect(screen.getByText('Failed')).toBeTruthy()
    expect(screen.getByText('Warning')).toBeTruthy()
    const first = portal.calls.find((call) => call.path === LIST)
    expect(first && query(first).get('limit')).toBe('25')
    expect(first && query(first).get('verdict')).toBeNull()
    expect(first && query(first).get('sort')).toBe('worst_first')
  })

  test('narrows the failure-rate chart to the chosen Agent', async () => {
    const portal = visit('owner', '/assessments?agentKind=inbound', list, rates)
    await screen.findByText('Unsupported claim, serious.')
    await waitFor(() => {
      const call = portal.calls.find((c) => c.path === RATES)
      expect(call && query(call).get('agentKind')).toBe('inbound')
    })
  })

  test('quotes the offending sentence of a Draft on request, and says why a Call turn has none', async () => {
    const portal = visit('owner', '/assessments', list, rates, draft)
    await portal.user.click(await screen.findByRole('button', { name: 'Quote the sentence' }))
    expect(await screen.findByText(/We guarantee a 40% saving\./)).toBeTruthy()
    expect(screen.getByText(/transcript is not available here yet/)).toBeTruthy()
  })

  test('puts the filters in the address and in the call', async () => {
    const portal = visit(
      'owner',
      '/assessments?verdict=fail&category=tone&agentKind=inbound&from=2026-10-01&to=2026-10-07',
      list,
      rates
    )
    await screen.findByText('Unsupported claim, serious.')
    const call = portal.calls.find((c) => c.path === LIST)
    expect(call && Object.fromEntries(query(call))).toMatchObject({
      verdict: 'fail',
      category: 'tone',
      agentKind: 'inbound',
      from: '2026-10-01',
      to: '2026-10-07',
    })
    await choose(portal.user, screen.getByRole('combobox', { name: 'Kind of finding' }), 'any')
    await waitFor(() => {
      const last = portal.calls.filter((c) => c.path === LIST).at(-1)
      expect(last && query(last).get('category')).toBeNull()
    })
  })

  test('sends feedback once with an Idempotency-Key and refreshes the list', async () => {
    let given: Call | undefined
    const feedback = route(
      'POST',
      `${LIST}/${hexId('asm', 1)}/findings/${hexId('fnd', 1)}/feedback`,
      (call) => {
        given = call
        return json(200, finding(1, { feedback: 'correct' }))
      }
    )
    const portal = visit('owner', '/assessments', list, rates, feedback)
    const button = await screen.findByRole('button', { name: /^Correct: Unsupported claim/ })
    await portal.user.click(button)
    await waitFor(() => expect(given).toBeDefined())
    expect(given?.body).toEqual({ feedback: 'correct' })
    expect(given?.headers.get(IDEMPOTENCY_KEY_HEADER)).toBeTruthy()
    await waitFor(() =>
      expect(portal.calls.filter((c) => c.path === LIST && c.method === 'GET').length).toBe(2)
    )
  })

  test('says in words when the assessment is gone, by code', async () => {
    const gone = route(
      'POST',
      `${LIST}/${hexId('asm', 1)}/findings/${hexId('fnd', 1)}/feedback`,
      failure(404, ASSESSMENT_ERRORS['assessment.not_found'].code)
    )
    const portal = visit('owner', '/assessments', list, rates, gone)
    await portal.user.click(
      await screen.findByRole('button', { name: /^False alarm: Unsupported/ })
    )
    expect(await screen.findByText(/no longer there/)).toBeTruthy()
  })

  test('charts the failure rate by week and never states a rate for a thin week', async () => {
    const portal = visit('owner', '/assessments', list, rates)
    expect(
      await screen.findByRole('img', { name: /Outbound Agent failure rate by week/ })
    ).toBeTruthy()
    expect(screen.getByRole('img', { name: /Inbound Agent failure rate by week/ })).toBeTruthy()
    expect(screen.getByText(/1 week has fewer than 20 records/)).toBeTruthy()
    const table = screen.getByRole('table', {
      hidden: true,
      name: 'Failure rate by week, Agent and instruction version',
    })
    expect(within(table).getByText('7 of 20')).toBeTruthy()
    expect(within(table).getAllByText('Not enough data').length).toBe(1)
    const call = portal.calls.find((c) => c.path === RATES && !query(c).get('groupBy'))
    expect(call && query(call).get('from')).toBeTruthy()
    expect(call && query(call).get('limit')).toBe('100')
  })

  test('splits the failure rate by kind of finding and states no rate for a thin cell', async () => {
    const portal = visit('owner', '/assessments', list, rates)
    const outbound = await screen.findByRole('table', { name: 'Outbound Agent' })
    const rows = within(outbound).getAllByRole('row')
    // Newest week first: W38 states both rates, W37 has a thin Tone cell.
    expect(within(rows[1] as HTMLElement).getByText('6%')).toBeTruthy()
    expect(within(rows[1] as HTMLElement).getByText('1%')).toBeTruthy()
    const thin = rows[2] as HTMLElement
    expect(within(thin).getByText('3%')).toBeTruthy()
    expect(within(thin).getByText('Not enough data')).toBeTruthy()
    expect(within(thin).getByText('12 of 20')).toBeTruthy()
    expect(within(thin).queryByText('0%')).toBeNull()
    expect(within(outbound).getByRole('columnheader', { name: 'Missing disclosure' })).toBeTruthy()
    expect(
      within(await screen.findByRole('table', { name: 'Inbound Agent' })).getByText('2%')
    ).toBeTruthy()
    expect(
      portal.calls.some((c) => c.path === RATES && query(c).get('groupBy') === 'category')
    ).toBe(true)
  })

  test('says so when the kind-of-finding view stops at the page cap', async () => {
    const endless = route('GET', RATES, (call) =>
      json(200, {
        from: query(call).get('from'),
        to: query(call).get('to'),
        items: [rate(37, 'outbound', 0.03, 40, 'tone'), rate(38, 'outbound', 0.03, 40, 'tone')],
        nextCursor: query(call).get('groupBy') === 'category' ? 'more' : null,
      })
    )
    visit('owner', '/assessments', list, endless)
    expect(
      await screen.findByText(
        /Showing weeks up to .*13.*\. Choose a shorter range to see later weeks\./
      )
    ).toBeTruthy()
  })

  test('the Agent filter narrows the kind-of-finding view too', async () => {
    const portal = visit('owner', '/assessments?agentKind=inbound', list, rates)
    await screen.findByRole('heading', { name: 'By kind of finding' })
    await waitFor(() => {
      const call = portal.calls.find(
        (c) => c.path === RATES && query(c).get('groupBy') === 'category'
      )
      expect(call && query(call).get('agentKind')).toBe('inbound')
    })
  })

  test('shows an empty list as one plain line', async () => {
    visit('owner', '/assessments', route('GET', LIST, json(200, page([]))), rates)
    expect(await screen.findByText('Nothing to review')).toBeTruthy()
  })

  test('passes axe in light and dark', async () => {
    visit('owner', '/assessments', list, rates)
    await screen.findByText('Unsupported claim, serious.')
    await screen.findByRole('img', { name: /Outbound Agent failure rate/ })
    await screen.findByRole('table', { name: 'Outbound Agent' })
    const run = async () =>
      (
        await axe.run(screen.getByRole('main'), { rules: { 'color-contrast': { enabled: false } } })
      ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
    expect(await run()).toEqual([])
    document.documentElement.classList.add('dark')
    expect(await run()).toEqual([])
  })
})
