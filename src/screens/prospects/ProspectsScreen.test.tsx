import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { MAX_EMPTY_PAGES } from '~/data/queries'
import { companyBody, hexId, memberBody, page, prospectBody } from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'
import { pickFrom } from '~/testing/select'

const PROSPECTS = '/v1/prospects'

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', url: string, ...handlers: Handler[]) {
  return renderPortal({
    url,
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers: [
      ...handlers,
      route('GET', '/v1/prospect-companies', json(200, page([companyBody(1, 'Acme')]))),
      route('GET', '/v1/members', json(200, page([memberBody(1, { name: 'Maya Chen' })]))),
    ],
  })
}

function listed(portal: ReturnType<typeof renderPortal>) {
  return portal.calls.filter((call) => call.path === PROSPECTS)
}

function params(url: string) {
  return new URL(url, 'http://x').searchParams
}

afterEach(() => {
  document.documentElement.classList.remove('dark')
  cleanup()
})

describe('Prospects: the list', () => {
  test('the Filters disclosure opens and closes the filter controls on small screens', async () => {
    const user = userEvent.setup()
    visit('rep', '/prospects', route('GET', PROSPECTS, json(200, page([prospectBody(1)]))))
    await screen.findByRole('table', { name: 'Prospects' })
    const toggle = screen.getByRole('button', { name: /^Filters/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })

  test('lists Prospects in a table with a link to each', async () => {
    visit('rep', '/prospects', route('GET', PROSPECTS, json(200, page([prospectBody(1)]))))
    const table = await screen.findByRole('table', { name: 'Prospects' })
    const row = within(table).getByRole('link', { name: 'First1 Last1' }).closest('tr')
    expect(row?.textContent).toContain('prospect1@example.com')
    expect(within(table).getByRole('link', { name: 'First1 Last1' }).getAttribute('href')).toBe(
      `/prospects/${hexId('prs', 1)}`
    )
  })

  test('a short page with a next cursor is not the end: Load more reads on', async () => {
    const portal = visit(
      'rep',
      '/prospects',
      route('GET', PROSPECTS, (call) =>
        params(call.url).get('cursor') === 'c2'
          ? json(200, page([prospectBody(3)]))
          : json(200, page([prospectBody(1), prospectBody(2)], 'c2'))
      )
    )
    await screen.findByText('First1 Last1')
    await portal.user.click(screen.getByRole('button', { name: 'Load more Prospects' }))
    await screen.findByText('First3 Last3')
    expect(params(listed(portal)[1]?.url ?? '').get('cursor')).toBe('c2')
    expect(screen.queryByRole('button', { name: 'Load more Prospects' })).toBeNull()
  })

  test('a page with no rows but a cursor is not empty: the next page is read', async () => {
    const portal = visit(
      'rep',
      '/prospects?q=ann',
      route('GET', PROSPECTS, (call) => {
        const cursor = params(call.url).get('cursor')
        if (cursor === 'c2') {
          return json(200, page([prospectBody(7)]))
        }
        return json(200, page([], 'c2'))
      })
    )
    await screen.findByText('First7 Last7')
    expect(screen.queryByText('No Prospect matches.')).toBeNull()
    expect(listed(portal).length).toBe(2)
  })

  test('empty pages that each carry a cursor stop at the cap and offer Load more', async () => {
    const portal = visit(
      'rep',
      '/prospects?q=ann',
      route('GET', PROSPECTS, (call) =>
        json(200, page([], `c${(params(call.url).get('cursor') ?? 'c0').slice(1)}x`))
      )
    )
    await screen.findByRole('button', { name: 'Load more Prospects' }, { timeout: 4000 })
    expect(listed(portal).length).toBe(MAX_EMPTY_PAGES + 1)
    expect(screen.queryByText('No Prospect matches.')).toBeNull()
  })

  test('says nothing matches only when the list has ended', async () => {
    visit('rep', '/prospects?q=zed', route('GET', PROSPECTS, json(200, page([]))))
    expect(await screen.findByText('No Prospect matches.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear the search and filters' })).toBeTruthy()
  })

  test('an empty Organization gets one sentence and one next action', async () => {
    visit('rep', '/prospects', route('GET', PROSPECTS, json(200, page([]))))
    expect(await screen.findByText('There are no Prospects yet.')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Add a Prospect' }).length).toBe(1)
  })

  test('search sends q and keeps it in the address', async () => {
    const portal = visit(
      'rep',
      '/prospects',
      route('GET', PROSPECTS, json(200, page([prospectBody(1)])))
    )
    await screen.findByText('First1 Last1')
    await portal.user.type(screen.getByLabelText('Search Prospects'), 'ann')
    await portal.user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() =>
      expect(listed(portal).some((c) => params(c.url).get('q') === 'ann')).toBe(true)
    )
    expect(portal.router.state.location.search).toMatchObject({ q: 'ann' })
  })

  test('status, Source and Prospect Company filters are sent to core', async () => {
    const company = hexId('pco', 1)
    const portal = visit(
      'rep',
      `/prospects?status=active&source=manual&company=${company}`,
      route('GET', PROSPECTS, json(200, page([prospectBody(1)])))
    )
    await screen.findByText('First1 Last1')
    const query = params(listed(portal)[0]?.url ?? '')
    expect(query.get('status')).toBe('active')
    expect(query.get('source')).toBe('manual')
    expect(query.get('companyId')).toBe(company)
  })

  test('a Rep has no Owner filter; an Admin does and it is sent', async () => {
    visit('rep', '/prospects', route('GET', PROSPECTS, json(200, page([prospectBody(1)]))))
    await screen.findByText('First1 Last1')
    expect(screen.queryByLabelText('Owner')).toBeNull()
    cleanup()
    const owner = hexId('mem', 1)
    const portal = visit(
      'admin',
      `/prospects?owner=${owner}`,
      route('GET', PROSPECTS, json(200, page([prospectBody(1)])))
    )
    await screen.findByText('First1 Last1')
    expect(screen.getByLabelText('Owner')).toBeTruthy()
    expect(params(listed(portal)[0]?.url ?? '').get('ownerMembershipId')).toBe(owner)
  })

  test('an error is explained by its code', async () => {
    visit('rep', '/prospects', route('GET', PROSPECTS, failure(500, 'server.internal')))
    expect((await screen.findByRole('alert')).textContent).toContain('Something went wrong')
  })

  test('passes axe in light and dark', async () => {
    visit('rep', '/prospects', route('GET', PROSPECTS, json(200, page([prospectBody(1)]))))
    await screen.findByText('First1 Last1')
    const run = async () =>
      (
        await axe.run(screen.getByRole('main'), { rules: { 'color-contrast': { enabled: false } } })
      ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
    expect(await run()).toEqual([])
    document.documentElement.classList.add('dark')
    expect(await run()).toEqual([])
  })
})

describe('Prospects: company names and the Owner search', () => {
  const companyCalls = (portal: ReturnType<typeof renderPortal>) =>
    portal.calls.filter((c) => c.path === '/v1/prospect-companies')
  const idsOf = (url: string) => (params(url).get('ids') ?? '').split(',').filter(Boolean)

  test('one request names every Company on a page, with each id once', async () => {
    const a = hexId('pco', 250)
    const b = hexId('pco', 251)
    const portal = visit(
      'rep',
      '/prospects',
      route('GET', '/v1/prospect-companies', (call) =>
        params(call.url).has('ids')
          ? json(200, page([companyBody(250, 'Zenith Works'), companyBody(251, 'Yarrow Ltd')]))
          : json(200, page([]))
      ),
      route(
        'GET',
        PROSPECTS,
        json(
          200,
          page([
            prospectBody(1, { companyId: a }),
            prospectBody(2, { companyId: b }),
            prospectBody(3, { companyId: a }),
          ])
        )
      )
    )
    await waitFor(() => expect(screen.getAllByText('Zenith Works').length).toBe(2))
    expect(screen.getByText('Yarrow Ltd')).toBeTruthy()
    const named = companyCalls(portal).filter((c) => params(c.url).has('ids'))
    expect(named.length).toBe(1)
    expect(idsOf(named[0]?.url ?? '')).toEqual([a, b])
    expect(portal.calls.some((c) => c.path.startsWith('/v1/prospect-companies/'))).toBe(false)
  })

  test('each page read asks once, the ids stay in chunks of at most 100 and settled chunks are not read again', async () => {
    const withCompany = (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, n) =>
        prospectBody(from + n, { companyId: hexId('pco', from + n) })
      )
    const portal = visit(
      'rep',
      '/prospects',
      route('GET', '/v1/prospect-companies', json(200, page([]))),
      route('GET', PROSPECTS, (call) =>
        params(call.url).get('cursor') === 'c2'
          ? json(200, page(withCompany(101, 130)))
          : json(200, page(withCompany(1, 100), 'c2'))
      )
    )
    await screen.findByRole('table', { name: 'Prospects' })
    const named = () => companyCalls(portal).filter((c) => params(c.url).has('ids'))
    await waitFor(() => expect(named().length).toBe(1))
    expect(idsOf(named()[0]?.url ?? '').length).toBe(100)
    await portal.user.click(screen.getByRole('button', { name: 'Load more Prospects' }))
    await waitFor(() => expect(named().length).toBe(2))
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(named().map((c) => idsOf(c.url).length)).toEqual([100, 30])
  })

  test('a Company the answer leaves out keeps its plain fallback name', async () => {
    const far = hexId('pco', 250)
    visit(
      'rep',
      '/prospects',
      route('GET', '/v1/prospect-companies', json(200, page([]))),
      route('GET', PROSPECTS, json(200, page([prospectBody(1, { companyId: far })])))
    )
    const row = (await screen.findByRole('link', { name: 'First1 Last1' })).closest('tr')
    await waitFor(() => expect(row?.textContent).toContain('Prospect Company'))
  })

  test('the Prospect Company filter names the Company from the same kind of read', async () => {
    const far = hexId('pco', 250)
    const portal = visit(
      'rep',
      `/prospects?company=${far}`,
      route('GET', '/v1/prospect-companies', json(200, page([companyBody(250, 'Zenith Works')]))),
      route('GET', PROSPECTS, json(200, page([prospectBody(1, { companyId: far })])))
    )
    expect((await screen.findAllByText('Zenith Works')).length).toBeGreaterThan(0)
    expect(idsOf(companyCalls(portal)[0]?.url ?? '')).toEqual([far])
  })

  test('the Owner filter searches members by name on the server, trimmed and after a pause', async () => {
    const portal = visit(
      'admin',
      '/prospects',
      route('GET', '/v1/members', (call) =>
        params(call.url).get('q') === 'zed'
          ? json(200, page([memberBody(150, { name: 'Zed Late' })]))
          : json(200, page([memberBody(1, { name: 'Maya Chen' })]))
      ),
      route('GET', PROSPECTS, json(200, page([prospectBody(1)])))
    )
    await screen.findByText('First1 Last1')
    const box = screen.getByLabelText('Owner') as HTMLInputElement
    expect(box.maxLength).toBe(100)
    await portal.user.type(box, '  zed ')
    const option = await screen.findByRole('option', { name: 'Zed Late' }, { timeout: 3000 })
    expect(option).toBeTruthy()
    const members = portal.calls.filter(
      (c) => c.path === '/v1/members' && !params(c.url).has('ids')
    )
    expect(members.every((c) => params(c.url).get('cursor') === null)).toBe(true)
    expect(members.some((c) => params(c.url).get('q') === 'zed')).toBe(true)
    expect(members.length).toBeLessThanOrEqual(2)
    expect(members.some((c) => (params(c.url).get('q') ?? 'zed') !== 'zed')).toBe(false)
  })

  test('a blank Owner search sends no q and reads no further pages', async () => {
    const portal = visit(
      'admin',
      '/prospects',
      route('GET', '/v1/members', json(200, page([memberBody(1, { name: 'Maya Chen' })], 'm2'))),
      route('GET', PROSPECTS, json(200, page([prospectBody(1)])))
    )
    await screen.findByText('First1 Last1')
    await portal.user.type(screen.getByLabelText('Owner'), '   ')
    await screen.findByRole('option', { name: 'Maya Chen' })
    await new Promise((resolve) => setTimeout(resolve, 500))
    const members = portal.calls.filter(
      (c) => c.path === '/v1/members' && !params(c.url).has('ids')
    )
    expect(members.length).toBe(1)
    expect(params(members[0]?.url ?? '').has('q')).toBe(false)
    expect(params(members[0]?.url ?? '').has('cursor')).toBe(false)
  })

  test('a chosen Owner keeps its name when a later search does not list it', async () => {
    const portal = visit(
      'admin',
      '/prospects',
      route('GET', '/v1/members', (call) =>
        params(call.url).get('q') === 'zzz'
          ? json(200, page([]))
          : json(200, page([memberBody(1, { name: 'Maya Chen' })]))
      ),
      route('GET', PROSPECTS, json(200, page([prospectBody(1)])))
    )
    await screen.findByText('First1 Last1')
    const owner = screen.getByLabelText('Owner') as HTMLInputElement
    await pickFrom(portal.user, owner, 'Maya Chen')
    await portal.user.clear(owner)
    await portal.user.type(owner, 'zzz')
    await waitFor(() =>
      expect(portal.calls.some((c) => params(c.url).get('q') === 'zzz')).toBe(true)
    )
    await portal.user.keyboard('{Escape}')
    await waitFor(() => expect(owner.value).toBe('Maya Chen'))
  })

  test('an Owner filter from the address stays selectable when that member is not listed', async () => {
    const unseen = hexId('mem', 900)
    visit(
      'admin',
      `/prospects?owner=${unseen}`,
      route('GET', PROSPECTS, json(200, page([prospectBody(1)])))
    )
    await screen.findByText('First1 Last1')
    const owner = screen.getByLabelText('Owner') as HTMLInputElement
    await waitFor(() => expect(owner.value).toBe('Selected owner'))
  })

  test('an Owner filter from the address shows that member by name, found with one ids lookup', async () => {
    const late = hexId('mem', 31)
    const portal = visit(
      'admin',
      `/prospects?owner=${late}`,
      route('GET', PROSPECTS, json(200, page([prospectBody(1, { ownerMembershipId: late })]))),
      route('GET', '/v1/members', (call) =>
        params(call.url).get('ids') === late
          ? json(200, page([memberBody(31, { name: 'Late Rep' })]))
          : json(200, page([memberBody(1, { name: 'Maya Chen' })]))
      )
    )
    await screen.findByText('First1 Last1')
    const owner = screen.getByLabelText('Owner') as HTMLInputElement
    await waitFor(() => expect(owner.value).toBe('Late Rep'))
    expect(portal.calls.filter((call) => params(call.url).has('ids'))).toHaveLength(1)
  })
})

describe('Prospects: the Owner on each row', () => {
  test('an Admin sees each row’s Owner by name, found with one ids lookup for the page', async () => {
    const a = hexId('mem', 41)
    const b = hexId('mem', 42)
    const portal = visit(
      'admin',
      '/prospects',
      route(
        'GET',
        PROSPECTS,
        json(
          200,
          page([
            prospectBody(1, { ownerMembershipId: a }),
            prospectBody(2, { ownerMembershipId: b }),
            prospectBody(3, { ownerMembershipId: a }),
            prospectBody(4, { ownerMembershipId: null }),
          ])
        )
      ),
      route('GET', '/v1/members', (call) =>
        params(call.url).has('ids')
          ? json(
              200,
              page([memberBody(41, { name: 'Ana Reyes' }), memberBody(42, { name: 'Bo Tran' })])
            )
          : json(200, page([memberBody(1, { name: 'Maya Chen' })]))
      )
    )
    const table = await screen.findByRole('table', { name: 'Prospects' })
    expect(within(table).getByRole('columnheader', { name: 'Owner' })).toBeTruthy()
    await waitFor(() => expect(within(table).getAllByText('Ana Reyes')).toHaveLength(2))
    expect(within(table).getByText('Bo Tran')).toBeTruthy()
    expect(portal.calls.filter((call) => params(call.url).has('ids'))).toHaveLength(1)
  })

  test('a Rep sees no Owner column and no member lookup', async () => {
    const portal = visit(
      'rep',
      '/prospects',
      route('GET', PROSPECTS, json(200, page([prospectBody(1)])))
    )
    const table = await screen.findByRole('table', { name: 'Prospects' })
    expect(within(table).queryByRole('columnheader', { name: 'Owner' })).toBeNull()
    expect(portal.calls.filter((call) => call.path === '/v1/members')).toHaveLength(0)
  })
})
