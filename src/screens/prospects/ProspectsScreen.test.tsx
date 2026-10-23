import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { MAX_EMPTY_PAGES } from '~/data/queries'
import { companyBody, hexId, memberBody, page, prospectBody } from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const PROSPECTS = '/v1/prospects'

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', url: string, ...handlers: Handler[]) {
  return renderPortal({
    url,
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers: [
      route('GET', '/v1/prospect-companies', json(200, page([companyBody(1, 'Acme')]))),
      route('GET', '/v1/members', json(200, page([memberBody(1, { name: 'Maya Chen' })]))),
      ...handlers,
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
