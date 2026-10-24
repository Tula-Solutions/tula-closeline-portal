import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { ANALYTICS_ERRORS, ERRORS } from 'tula-closeline-contract'
import { hexId, memberBody, page } from '~/testing/core-bodies'
import { type Call, failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'
import { choose } from '~/testing/select'

const SERIES = '/v1/analytics/series'
const TABLE = '/v1/analytics/table'
const CSV = '/v1/analytics/table.csv'
const RANGE = 'from=2026-10-01&to=2026-10-07'

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

function count(value: number, recordCount = value) {
  return { kind: 'count', value, recordCount }
}

function rate(value: number | null, recordCount: number) {
  return value === null
    ? { kind: 'rate', state: 'not_enough_data', value: null, recordCount }
    : { kind: 'rate', state: 'ok', value, recordCount }
}

function seriesBody(metric: string, values: Record<string, number>) {
  return {
    from: '2026-10-01',
    to: '2026-10-07',
    metric,
    groupBy: null,
    series: [
      {
        group: null,
        points: Object.entries(values).map(([day, value]) => ({
          day,
          kind: 'count',
          value,
          recordCount: value,
        })),
      },
    ],
    nextCursor: null,
  }
}

function tableRow(group: string, overrides: Record<string, unknown> = {}) {
  return {
    group,
    sends: count(100),
    replies: count(30),
    positiveReplies: count(10),
    meetings: count(4),
    outcomesWon: count(2),
    outcomesLost: count(1),
    replyRate: rate(0.3, 100),
    positiveReplyRate: rate(0.1, 100),
    meetingRate: rate(0.04, 100),
    winRate: rate(null, 3),
    ...overrides,
  }
}

const series: Handler = route('GET', SERIES, (call) =>
  json(
    200,
    seriesBody(
      query(call).get('metric') ?? '',
      query(call).get('metric') === 'sends' ? { '2026-10-02': 5, '2026-10-03': 7 } : {}
    )
  )
)

const campaigns = route(
  'GET',
  TABLE,
  json(200, page([tableRow(hexId('cpg', 1)), tableRow(hexId('cpg', 2), { sends: count(40) })]))
)

describe('Overview', () => {
  test('shows each metric with its total, a chart and a table view', async () => {
    const portal = visit('owner', `/analytics?${RANGE}`, series)
    const heading = await screen.findByRole('heading', { name: 'Sends' })
    const section = heading.closest('section') as HTMLElement
    expect(await within(section).findByText('12')).toBeTruthy()
    expect(
      within(section).getByRole('img', { name: /Sends by day, 12 in total, most on .* with 7\./ })
    ).toBeTruthy()
    await portal.user.click(within(section).getByRole('button', { name: 'View as table' }))
    const table = within(section).getByRole('table')
    expect(within(table).getAllByRole('row').length).toBe(1 + 7)
  })

  test('says in words when a metric has nothing in the range', async () => {
    visit('owner', `/analytics?${RANGE}`, series)
    expect(await screen.findAllByText(/No replies in this range/)).toBeTruthy()
  })

  test('asks core for the range and filters in the address', async () => {
    const portal = visit('admin', `/analytics?${RANGE}&channel=email&agentKind=inbound`, series)
    await screen.findByRole('heading', { name: 'Sends' })
    await waitFor(() => expect(portal.calls.some((call) => call.path === SERIES)).toBe(true))
    const first = portal.calls.find((call) => call.path === SERIES)
    expect(first && query(first).get('from')).toBe('2026-10-01')
    expect(first && query(first).get('to')).toBe('2026-10-07')
    expect(first && query(first).get('channel')).toBe('email')
    expect(first && query(first).get('agentKind')).toBe('inbound')
  })

  test('a preset moves the range and the address', async () => {
    const portal = visit('owner', `/analytics?${RANGE}`, series)
    await screen.findByRole('heading', { name: 'Sends' })
    await portal.user.click(screen.getByRole('button', { name: 'Last 7 days' }))
    await waitFor(() => {
      const last = portal.calls.filter((call) => call.path === SERIES).at(-1)
      expect(last && query(last).get('from')).not.toBe('2026-10-01')
    })
    expect(screen.getByRole('button', { name: 'Last 7 days' }).getAttribute('aria-pressed')).toBe(
      'true'
    )
  })

  test('refuses a range over 13 months without asking core', async () => {
    const portal = visit('owner', '/analytics?from=2025-01-01&to=2026-10-07', series)
    expect(await screen.findByText(/longer than 13 months/)).toBeTruthy()
    expect(portal.calls.some((call) => call.path === SERIES)).toBe(false)
  })

  test('core refusing the range is said by its code, not its status', async () => {
    visit(
      'owner',
      `/analytics?${RANGE}`,
      route('GET', SERIES, failure(422, ANALYTICS_ERRORS['analytics.range_too_large'].code))
    )
    expect((await screen.findAllByText(/longer than 13 months/)).length).toBeGreaterThan(0)
  })

  test('a failure shows Try again that asks again', async () => {
    let calls = 0
    const portal = visit(
      'owner',
      `/analytics?${RANGE}`,
      route('GET', SERIES, () => {
        calls += 1
        return failure(503, 'server.unavailable')
      })
    )
    const buttons = await screen.findAllByRole('button', { name: 'Try again' })
    const before = calls
    await portal.user.click(buttons[0] as HTMLElement)
    await waitFor(() => expect(calls).toBeGreaterThan(before))
  })

  test('replies and positive replies link to the inbox; the note says what it cannot narrow', async () => {
    visit(
      'owner',
      `/analytics?${RANGE}&channel=email`,
      route('GET', SERIES, (call) =>
        json(200, seriesBody(query(call).get('metric') ?? '', { '2026-10-02': 3 }))
      )
    )
    await screen.findByRole('heading', { name: 'Positive replies' })
    const links = await screen.findAllByRole('link', { name: 'See the Conversations' })
    expect(links.length).toBe(2)
    const hrefs = links.map((link) => link.getAttribute('href') ?? '')
    expect(hrefs.filter((href) => href.includes('label=positive')).length).toBe(1)
    for (const href of hrefs) {
      expect(href).toContain('channel=email')
    }
    expect(screen.getByText(/not yet by Campaign, Rep or day/)).toBeTruthy()
  })

  test.each(['manager', 'rep'] as const)(
    'a %s never sends Channel, Agent or Campaign, and sees no such filters',
    async (role) => {
      const portal = visit(
        role,
        `/analytics?${RANGE}&channel=email&agentKind=inbound&campaignId=${hexId('cpg', 1)}`,
        series
      )
      await screen.findByRole('heading', { name: 'Sends' })
      await waitFor(() => expect(portal.calls.some((call) => call.path === SERIES)).toBe(true))
      for (const call of portal.calls.filter((c) => c.path === SERIES)) {
        const q = query(call)
        expect(q.get('channel')).toBeNull()
        expect(q.get('agentKind')).toBeNull()
        expect(q.get('campaignId')).toBeNull()
      }
      expect(screen.queryByRole('combobox', { name: 'Channel' })).toBeNull()
      expect(screen.getByText(/Today only meetings are credited to a Rep/)).toBeTruthy()
    }
  )

  test('an Owner has the Channel and Agent filters', async () => {
    visit('owner', `/analytics?${RANGE}`, series)
    await screen.findByRole('heading', { name: 'Sends' })
    expect(screen.getByRole('combobox', { name: 'Channel' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Agent' })).toBeTruthy()
  })

  test('passes axe in light and dark', async () => {
    visit('owner', `/analytics?${RANGE}`, series)
    await screen.findByRole('heading', { name: 'Sends' })
    await screen.findByRole('img', { name: /Sends by day/ })
    const run = async () =>
      (
        await axe.run(screen.getByRole('main'), { rules: { 'color-contrast': { enabled: false } } })
      ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
    expect(await run()).toEqual([])
    document.documentElement.classList.add('dark')
    expect(await run()).toEqual([])
  })
})

describe('Navigation by role', () => {
  test.each([
    ['owner', true, 'Reps'],
    ['admin', true, 'Reps'],
    ['manager', false, 'Reps'],
    ['rep', false, 'Your numbers'],
  ] as const)(
    'a %s sees Campaigns: %s, and the Reps link reads %s',
    async (role, campaignsLink, reps) => {
      visit(role, `/analytics?${RANGE}`, series)
      await screen.findByRole('heading', { name: 'Sends' })
      expect(screen.queryByRole('link', { name: 'Campaigns' }) !== null).toBe(campaignsLink)
      expect(screen.getByRole('link', { name: reps })).toBeTruthy()
    }
  )

  test('a Manager who opens the Campaigns view is told, and nothing is requested', async () => {
    const portal = visit('manager', `/analytics/campaigns?${RANGE}`, campaigns)
    expect(await screen.findByText(/Comparing Campaigns is for an Owner or Admin/)).toBeTruthy()
    expect(portal.calls.some((call) => call.path === TABLE)).toBe(false)
  })
})

describe('Campaign comparison', () => {
  test('lists each Campaign by id with counts, and rates with their sample', async () => {
    visit('owner', `/analytics/campaigns?${RANGE}`, campaigns)
    const table = await screen.findByRole('table')
    expect(within(table).getByText(hexId('cpg', 1))).toBeTruthy()
    expect(within(table).getAllByText('30%').length).toBeGreaterThan(0)
    expect(within(table).getAllByText('n = 100').length).toBeGreaterThan(0)
  })

  test('a rate with too few records says so with the sample size, never zero', async () => {
    visit('owner', `/analytics/campaigns?${RANGE}`, campaigns)
    const table = await screen.findByRole('table')
    expect(within(table).getAllByText('Not enough data').length).toBeGreaterThan(0)
    expect(within(table).getAllByText('n = 3 of 20 needed').length).toBeGreaterThan(0)
    expect(within(table).queryByText('0%')).toBeNull()
  })

  test('a Campaign row opens the Overview filtered to it', async () => {
    visit('owner', `/analytics/campaigns?${RANGE}`, campaigns, series)
    const link = await screen.findByRole('link', { name: new RegExp(hexId('cpg', 1)) })
    expect(link.getAttribute('href')).toContain(`campaignId=${hexId('cpg', 1)}`)
  })

  test('pages with the cursor and asks for at most 100', async () => {
    const portal = visit(
      'owner',
      `/analytics/campaigns?${RANGE}`,
      route('GET', TABLE, (call) =>
        query(call).get('cursor') === 'c2'
          ? json(200, page([tableRow(hexId('cpg', 9))]))
          : json(200, page([tableRow(hexId('cpg', 1))], 'c2'))
      )
    )
    await screen.findAllByText(hexId('cpg', 1))
    await portal.user.click(screen.getByRole('button', { name: /Load more/ }))
    expect((await screen.findAllByText(hexId('cpg', 9))).length).toBeGreaterThan(0)
    expect(screen.getAllByText(hexId('cpg', 1)).length).toBeGreaterThan(0)
    const first = portal.calls.find((call) => call.path === TABLE)
    expect(first && query(first).get('groupBy')).toBe('campaign')
    expect(Number(first && query(first).get('limit'))).toBeLessThanOrEqual(100)
  })

  test('says when there are no Campaigns in the range, and when it fails', async () => {
    visit('owner', `/analytics/campaigns?${RANGE}`, route('GET', TABLE, json(200, page([]))))
    expect(await screen.findByText('No Campaign numbers in this range')).toBeTruthy()
  })

  test('an error offers to try again', async () => {
    visit(
      'owner',
      `/analytics/campaigns?${RANGE}`,
      route('GET', TABLE, failure(503, 'server.unavailable'))
    )
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  test('the table asks only for a filter on its own dimension and offers no Channel or Agent', async () => {
    const portal = visit(
      'owner',
      `/analytics/campaigns?${RANGE}&channel=email&agentKind=inbound&campaignId=${hexId('cpg', 1)}`,
      campaigns
    )
    await screen.findByRole('table')
    const call = portal.calls.find((c) => c.path === TABLE)
    expect(call && query(call).get('channel')).toBeNull()
    expect(call && query(call).get('agentKind')).toBeNull()
    expect(call && query(call).get('campaignId')).toBe(hexId('cpg', 1))
    expect(screen.queryByRole('combobox', { name: 'Channel' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Agent' })).toBeNull()
  })

  test('a refused request is an error state, not a blank table', async () => {
    visit(
      'owner',
      `/analytics/campaigns?${RANGE}`,
      route('GET', TABLE, failure(422, ERRORS['request.invalid'].code))
    )
    expect(await screen.findByText(/could not be used together/i)).toBeTruthy()
    expect(screen.queryByText('No Campaign numbers in this range')).toBeNull()
  })

  test('the bar chart can compare by another count', async () => {
    const portal = visit('owner', `/analytics/campaigns?${RANGE}`, campaigns)
    await screen.findByRole('table')
    expect(screen.getByRole('heading', { name: 'Sends by Campaign' })).toBeTruthy()
    await choose(portal.user, screen.getByRole('combobox', { name: 'Compare by' }), 'meetings')
    expect(await screen.findByRole('heading', { name: 'Meetings by Campaign' })).toBeTruthy()
  })
})

describe('Rep views', () => {
  const mem1 = hexId('mem', 1)

  test('a Manager sees one row per Rep, by name, and never asks for Campaign grouping', async () => {
    const portal = visit(
      'manager',
      `/analytics/reps?${RANGE}`,
      route('GET', TABLE, json(200, page([tableRow(mem1)]))),
      route('GET', '/v1/members', json(200, page([memberBody(1, { name: 'Ada Rep' })])))
    )
    expect(await screen.findByRole('link', { name: /Ada Rep/ })).toBeTruthy()
    const call = portal.calls.find((c) => c.path === TABLE)
    expect(call && query(call).get('groupBy')).toBe('rep')
    expect(call && query(call).get('campaignId')).toBeNull()
  })

  test('a Rep sees only their own row, as You, and looks up no members', async () => {
    const portal = visit(
      'rep',
      `/analytics/reps?${RANGE}`,
      route('GET', TABLE, json(200, page([tableRow(mem1)])))
    )
    expect(await screen.findByRole('heading', { name: 'Your numbers' })).toBeTruthy()
    expect((await screen.findAllByRole('link', { name: /You/ })).length).toBeGreaterThan(0)
    expect(portal.calls.some((call) => call.path === '/v1/members')).toBe(false)
    expect(screen.queryByRole('combobox', { name: 'Rep' })).toBeNull()
  })

  test('an address filter the Reps view offers no control for is not sent', async () => {
    const portal = visit(
      'admin',
      `/analytics/reps?${RANGE}&channel=email&agentKind=inbound&campaignId=${hexId('cpg', 1)}`,
      route('GET', TABLE, json(200, page([tableRow(mem1)]))),
      route('GET', '/v1/members', json(200, page([memberBody(1, { name: 'Ada Rep' })])))
    )
    expect(await screen.findByRole('link', { name: /Ada Rep/ })).toBeTruthy()
    const call = portal.calls.find((c) => c.path === TABLE)
    expect(call && query(call).get('channel')).toBeNull()
    expect(call && query(call).get('agentKind')).toBeNull()
    expect(call && query(call).get('campaignId')).toBeNull()
  })

  test('the Reps view shows no Campaign chip for a Campaign it does not apply', async () => {
    visit(
      'admin',
      `/analytics/reps?${RANGE}&campaignId=${hexId('cpg', 1)}`,
      route('GET', TABLE, json(200, page([tableRow(mem1)]))),
      route('GET', '/v1/members', json(200, page([memberBody(1, { name: 'Ada Rep' })])))
    )
    expect(await screen.findByRole('link', { name: /Ada Rep/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Clear Campaign' })).toBeNull()
  })

  test('the empty state explains that only meetings are credited to a Rep', async () => {
    visit('manager', `/analytics/reps?${RANGE}`, route('GET', TABLE, json(200, page([]))))
    expect(await screen.findByText('No Rep numbers in this range')).toBeTruthy()
    expect(screen.getAllByText(/only meetings are credited to a Rep/).length).toBeGreaterThan(0)
  })

  test('a Rep outside the view is said in words, by the request.not_found code', async () => {
    visit(
      'manager',
      `/analytics/reps?${RANGE}&repMembershipId=${hexId('mem', 7)}`,
      route('GET', TABLE, failure(404, ERRORS['request.not_found'].code)),
      route('GET', '/v1/members', json(200, page([])))
    )
    expect(await screen.findByText(/not one of the people your numbers cover/)).toBeTruthy()
  })

  test('auth.forbidden is said as a role limit', async () => {
    visit(
      'manager',
      `/analytics/reps?${RANGE}`,
      route('GET', TABLE, failure(403, ERRORS['auth.forbidden'].code)),
      route('GET', '/v1/members', json(200, page([])))
    )
    expect(await screen.findByText(/Your role cannot break the numbers down that way/)).toBeTruthy()
  })
})

describe('CSV', () => {
  const originals = {
    create: URL.createObjectURL,
    revoke: URL.revokeObjectURL,
    click: HTMLAnchorElement.prototype.click,
  }
  beforeEach(() => {
    HTMLAnchorElement.prototype.click = () => {}
    URL.revokeObjectURL = () => {}
  })
  afterEach(() => {
    URL.createObjectURL = originals.create
    URL.revokeObjectURL = originals.revoke
    HTMLAnchorElement.prototype.click = originals.click
  })

  test('joins the pages into one file with one header and keeps the filters', async () => {
    let blob: Blob | undefined
    URL.createObjectURL = (made: Blob | MediaSource) => {
      blob = made as Blob
      return 'blob:analytics'
    }
    const portal = visit(
      'owner',
      `/analytics/campaigns?${RANGE}&campaignId=${hexId('cpg', 1)}`,
      campaigns,
      (call) => {
        if (call.path !== CSV) {
          return null
        }
        return query(call).get('cursor') === 'p2'
          ? new Response('group,sends\ncpg_2,40\n', { headers: { 'content-type': 'text/csv' } })
          : new Response('group,sends\ncpg_1,100\n', {
              headers: { 'content-type': 'text/csv', 'x-next-cursor': 'p2' },
            })
      }
    )
    await screen.findByRole('table')
    await portal.user.click(screen.getByRole('button', { name: /Download CSV/ }))
    await waitFor(() => expect(blob).toBeDefined())
    expect(await blob?.text()).toBe('group,sends\ncpg_1,100\ncpg_2,40\n')
    const csvCalls = portal.calls.filter((call) => call.path === CSV)
    expect(csvCalls.length).toBe(2)
    expect(query(csvCalls[0] as Call).get('campaignId')).toBe(hexId('cpg', 1))
    expect(query(csvCalls[0] as Call).get('groupBy')).toBe('campaign')
  })

  test('a page without a trailing newline still joins on its own row', async () => {
    let blob: Blob | undefined
    URL.createObjectURL = (made: Blob | MediaSource) => {
      blob = made as Blob
      return 'blob:analytics'
    }
    const portal = visit('owner', `/analytics/campaigns?${RANGE}`, campaigns, (call) => {
      if (call.path !== CSV) {
        return null
      }
      return query(call).get('cursor') === 'p2'
        ? new Response('group,sends\ncpg_2,40', { headers: { 'content-type': 'text/csv' } })
        : new Response('group,sends\ncpg_1,100', {
            headers: { 'content-type': 'text/csv', 'x-next-cursor': 'p2' },
          })
    })
    await screen.findByRole('table')
    await portal.user.click(screen.getByRole('button', { name: /Download CSV/ }))
    await waitFor(() => expect(blob).toBeDefined())
    expect(await blob?.text()).toBe('group,sends\ncpg_1,100\ncpg_2,40')
  })

  test('a header-only last page without a newline adds no second header', async () => {
    let blob: Blob | undefined
    URL.createObjectURL = (made: Blob | MediaSource) => {
      blob = made as Blob
      return 'blob:analytics'
    }
    const portal = visit('owner', `/analytics/campaigns?${RANGE}`, campaigns, (call) => {
      if (call.path !== CSV) {
        return null
      }
      return query(call).get('cursor') === 'p2'
        ? new Response('group,sends', { headers: { 'content-type': 'text/csv' } })
        : new Response('group,sends\ncpg_1,100\n', {
            headers: { 'content-type': 'text/csv', 'x-next-cursor': 'p2' },
          })
    })
    await screen.findByRole('table')
    await portal.user.click(screen.getByRole('button', { name: /Download CSV/ }))
    await waitFor(() => expect(blob).toBeDefined())
    expect(await blob?.text()).toBe('group,sends\ncpg_1,100\n')
  })

  test('a failure is said and the button works again', async () => {
    const portal = visit(
      'owner',
      `/analytics/campaigns?${RANGE}`,
      campaigns,
      route('GET', CSV, failure(503, 'server.unavailable'))
    )
    await screen.findByRole('table')
    await portal.user.click(screen.getByRole('button', { name: /Download CSV/ }))
    expect(await screen.findByText(/try again/i)).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /Download CSV/ }).getAttribute('aria-disabled')
    ).not.toBe('true')
  })
})
