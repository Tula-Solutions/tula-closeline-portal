import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { ERRORS } from 'tula-closeline-contract'
import { dealBody, hexId, page } from '~/testing/core-bodies'
import { type Call, failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'
import { choose } from '~/testing/select'

const DEAL = hexId('deal', 1)
const ATTRIBUTION = `/v1/analytics/deals/${DEAL}/attribution`
const SOURCES = '/v1/analytics/source-performance'

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

function touch(n: number, overrides: Record<string, unknown> = {}) {
  return {
    kind: 'message',
    messageId: hexId('msg', n),
    id: hexId('tch', n),
    prospectId: hexId('prs', 1),
    occurredAt: `2026-09-0${n}T10:00:00.000Z`,
    credit: { firstTouch: false, lastTouch: false },
    sources: [],
    ...overrides,
  }
}

function attribution(
  items: unknown[],
  nextCursor: string | null = null,
  overrides: Record<string, unknown> = {}
) {
  return {
    dealRecordId: DEAL,
    outcome: 'won',
    lookbackDays: 180,
    firstTouchId: hexId('tch', 1),
    lastTouchId: hexId('tch', 3),
    touches: { items, nextCursor },
    ...overrides,
  }
}

const touches = [
  touch(1, { credit: { firstTouch: true, lastTouch: false } }),
  touch(2, {
    sources: [{ kind: 'document', documentId: hexId('doc', 7), page: 4 }],
  }),
  touch(3, {
    kind: 'call',
    callId: hexId('call', 3),
    messageId: undefined,
    credit: { firstTouch: false, lastTouch: true },
    sources: [{ kind: 'moment', callId: hexId('call', 9), dealRecordId: DEAL, momentIndex: 1 }],
  }),
]

const deal: Handler = route('GET', ATTRIBUTION, json(200, attribution(touches)))

function source(n: number, overrides: Record<string, unknown> = {}) {
  return {
    source: { kind: 'document', documentId: hexId('doc', n), page: n },
    dealsTouched: 40,
    dealsWon: 10,
    recordCount: 40,
    winRate: { state: 'ok', value: 0.25 },
    flag: null,
    ...overrides,
  }
}

const sources = [
  source(1),
  source(2, {
    dealsTouched: 30,
    dealsWon: 3,
    recordCount: 30,
    winRate: { state: 'ok', value: 0.1 },
    flag: 'cited_often_lost',
  }),
  source(3, {
    dealsTouched: 6,
    dealsWon: 3,
    recordCount: 6,
    winRate: { state: 'not_enough_data', value: null },
  }),
]

const sourceList: Handler = route('GET', SOURCES, (call) =>
  json(
    200,
    page(query(call).get('flag') === 'cited_often_lost' ? sources.filter((s) => s.flag) : sources)
  )
)

let dark = false
beforeEach(() => {
  dark = document.documentElement.classList.contains('dark')
})
afterEach(() => {
  document.documentElement.classList.toggle('dark', dark)
})

describe('Deal attribution', () => {
  test.each(['manager', 'rep'] as const)(
    'a %s sees a notice, no entry in the navigation and makes no request',
    async (role) => {
      const portal = visit(role, `/analytics/deals/${DEAL}`, deal, sourceList)
      expect(await screen.findByRole('heading', { name: 'Not allowed' })).toBeTruthy()
      expect(screen.queryByRole('link', { name: 'Playbook sources' })).toBeNull()
      expect(portal.calls.some((c) => c.path === ATTRIBUTION || c.path === SOURCES)).toBe(false)
    }
  )

  test.each(['manager', 'rep'] as const)(
    'a %s gets the same notice on the sources',
    async (role) => {
      const portal = visit(role, '/analytics/sources', deal, sourceList)
      expect(await screen.findByRole('heading', { name: 'Not allowed' })).toBeTruthy()
      expect(portal.calls.some((c) => c.path === SOURCES)).toBe(false)
    }
  )

  test('an Owner has the entry in the navigation', async () => {
    visit('owner', '/analytics', sourceList)
    expect(await screen.findByRole('link', { name: 'Playbook sources' })).toBeTruthy()
  })

  test('lists the touches in order with the sources each cited, asking for a bounded page', async () => {
    const portal = visit('admin', `/analytics/deals/${DEAL}`, deal)
    const rows = await screen.findAllByRole('row')
    expect(rows.slice(1).map((row) => row.textContent)).toEqual([
      expect.stringMatching(/^1.*Message.*First touchNone$/),
      expect.stringMatching(/^2.*MessageNo creditDocument …\w+, page 4$/),
      expect.stringMatching(/^3.*CallLast touchMoment 2 of Call …\w+$/),
    ])
    const first = portal.calls.find((c) => c.path === ATTRIBUTION)
    expect(first && query(first).get('limit')).toBe('100')
  })

  test('shows first-touch and last-touch credit side by side with the sample size', async () => {
    visit('owner', `/analytics/deals/${DEAL}`, deal)
    const first = await screen.findByRole('region', { name: 'First-touch credit' })
    const last = screen.getByRole('region', { name: 'Last-touch credit' })
    expect(within(first).getByText(/Message 1,/)).toBeTruthy()
    expect(within(last).getByText(/Call 3,/)).toBeTruthy()
    expect(screen.getByText(/3 touches shown, all of them/)).toBeTruthy()
    expect(screen.getByText(/last 180 days/)).toBeTruthy()
  })

  test('says where a touch is when its page is not loaded, and shows more on request', async () => {
    const portal = visit(
      'owner',
      `/analytics/deals/${DEAL}`,
      route('GET', ATTRIBUTION, (call) =>
        query(call).get('cursor') === 'c2'
          ? json(200, attribution([touches[2]]))
          : json(200, attribution(touches.slice(0, 2), 'c2'))
      )
    )
    const last = await screen.findByRole('region', { name: 'Last-touch credit' })
    expect(within(last).getByText(/on a later page/)).toBeTruthy()
    expect(screen.getByText(/2 touches shown, and there are more/)).toBeTruthy()
    await portal.user.click(screen.getByRole('button', { name: 'Load more touches' }))
    expect(await within(last).findByText(/Call 3,/)).toBeTruthy()
    expect(portal.calls.filter((c) => c.path === ATTRIBUTION)).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Load more touches' })).toBeNull()
  })

  test('says in words that the Deal is not found, by code, and does not offer a retry', async () => {
    visit(
      'owner',
      `/analytics/deals/${DEAL}`,
      route('GET', ATTRIBUTION, failure(404, ERRORS['request.not_found'].code))
    )
    expect(await screen.findByText(/There is no Attribution for that Deal/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  test('says in words that the service could not be reached, and offers Try again', async () => {
    let broken = true
    const portal = visit(
      'owner',
      `/analytics/deals/${DEAL}`,
      route('GET', ATTRIBUTION, () =>
        broken ? failure(503, ERRORS['server.unavailable'].code) : json(200, attribution(touches))
      )
    )
    await screen.findByRole('button', { name: 'Try again' }, { timeout: 4000 })
    broken = false
    await portal.user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('region', { name: 'First-touch credit' })).toBeTruthy()
  })

  test('shows a loading line while the touches are read', async () => {
    visit(
      'owner',
      `/analytics/deals/${DEAL}`,
      route('GET', ATTRIBUTION, () => new Promise(() => {}))
    )
    expect(await screen.findByText('Loading touches...')).toBeTruthy()
  })

  test('says in words that a Deal has no touches', async () => {
    visit(
      'owner',
      `/analytics/deals/${DEAL}`,
      route(
        'GET',
        ATTRIBUTION,
        json(200, attribution([], null, { firstTouchId: null, lastTouchId: null }))
      )
    )
    expect(await screen.findByText('No touches')).toBeTruthy()
  })

  test.each([
    ['owner', 'won', true],
    ['admin', 'lost', true],
    ['owner', 'open', false],
  ] as const)(
    'the Deal of a %s (%s) links to its Attribution: %p',
    async (role, outcome, linked) => {
      visit(
        role,
        `/sales-history/deals/${DEAL}`,
        route('GET', `/v1/playbook/deals/${DEAL}`, json(200, dealBody(1, { outcome })))
      )
      await screen.findByText('Calls of this Deal')
      const link = screen.queryByRole('link', { name: 'Which touches led to this Outcome' })
      expect(link !== null).toBe(linked)
      if (link) {
        expect(link.getAttribute('href')).toBe(`/analytics/deals/${DEAL}`)
      }
    }
  )

  test('passes axe in light and dark', async () => {
    visit('owner', `/analytics/deals/${DEAL}`, deal)
    await screen.findByRole('region', { name: 'First-touch credit' })
    const run = async () =>
      (
        await axe.run(screen.getByRole('main'), { rules: { 'color-contrast': { enabled: false } } })
      ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
    expect(await run()).toEqual([])
    document.documentElement.classList.add('dark')
    expect(await run()).toEqual([])
  })
})

describe('Playbook sources', () => {
  test('lists source, win rate, n and the flag in words', async () => {
    const portal = visit('owner', '/analytics/sources', sourceList)
    const rows = (await screen.findAllByRole('row')).slice(1)
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/^Document …\w+, page 125%4010None$/),
      expect.stringMatching(
        /^Document …\w+, page 210%303Cited often, but its Deals tend to be lost$/
      ),
      expect.stringMatching(/^Document …\w+, page 3.*needs 2063None$/),
    ])
    const first = portal.calls.find((c) => c.path === SOURCES)
    expect(first && query(first).get('limit')).toBe('100')
    expect(first && query(first).get('flag')).toBeNull()
  })

  test('filters to the flagged sources and keeps the filter in the address', async () => {
    const portal = visit('owner', '/analytics/sources', sourceList)
    await screen.findByText(/page 1/)
    await choose(portal.user, screen.getByRole('combobox', { name: 'Show' }), 'cited_often_lost')
    await waitFor(() => expect(screen.queryByText(/page 1$/)).toBeNull())
    expect(screen.getByText(/page 2/)).toBeTruthy()
    const last = portal.calls.filter((c) => c.path === SOURCES).at(-1)
    expect(last && query(last).get('flag')).toBe('cited_often_lost')
  })

  test('says in words when no source is flagged', async () => {
    visit(
      'owner',
      '/analytics/sources?flag=cited_often_lost',
      route('GET', SOURCES, json(200, page([])))
    )
    expect(await screen.findByText('No source is flagged')).toBeTruthy()
  })

  test('pages on the cursor with Load more, never reading every page', async () => {
    const portal = visit(
      'admin',
      '/analytics/sources',
      route('GET', SOURCES, (call) =>
        query(call).get('cursor') === 'c2'
          ? json(200, page([sources[2]]))
          : json(200, page(sources.slice(0, 2), 'c2'))
      )
    )
    await screen.findByText(/page 2/)
    expect(portal.calls.filter((c) => c.path === SOURCES)).toHaveLength(1)
    await portal.user.click(screen.getByRole('button', { name: 'Load more sources' }))
    expect(await screen.findByText(/page 3/)).toBeTruthy()
    expect(portal.calls.filter((c) => c.path === SOURCES)).toHaveLength(2)
  })

  test('says in words when the list cannot be read, by code', async () => {
    visit(
      'owner',
      '/analytics/sources',
      route('GET', SOURCES, failure(403, ERRORS['auth.forbidden'].code))
    )
    expect(
      await screen.findByText(/Only an Owner or Admin can see how Playbook sources/)
    ).toBeTruthy()
  })

  test('says there are no sources yet', async () => {
    visit('owner', '/analytics/sources', route('GET', SOURCES, json(200, page([]))))
    expect(await screen.findByText('No sources yet')).toBeTruthy()
  })

  test('passes axe in light and dark', async () => {
    visit('owner', '/analytics/sources', sourceList)
    await screen.findByText(/page 1/)
    const run = async () =>
      (
        await axe.run(screen.getByRole('main'), { rules: { 'color-contrast': { enabled: false } } })
      ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
    expect(await run()).toEqual([])
    document.documentElement.classList.add('dark')
    expect(await run()).toEqual([])
  })
})
