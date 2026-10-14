import { describe, expect, test } from 'bun:test'
import { screen, waitFor, within } from '@testing-library/react'
import { callBody, dealBody, documentBody, memberBody, page } from '~/testing/core-bodies'
import { failure, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const MEMBERS = '/v1/members'
const DOCS = '/v1/playbook/documents'
const DEALS = '/v1/playbook/deals'
const CALLS = '/v1/playbook/calls'

function visit(
  role: 'owner' | 'admin' | 'manager' | 'rep',
  ...handlers: ReturnType<typeof route>[]
) {
  return renderPortal({
    url: '/',
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers,
  })
}

async function tiles() {
  return within(await screen.findByRole('list', { name: 'Your Organization in numbers' }))
}

describe('home: the dashboard', () => {
  test('an Owner sees a count for members, documents, won Deals and Calls, with more pages shown as +', async () => {
    const portal = visit(
      'owner',
      route('GET', MEMBERS, json(200, page([memberBody(1), memberBody(2), memberBody(3)]))),
      route('GET', DOCS, json(200, page([documentBody(1), documentBody(2)], 'c2'))),
      route('GET', DEALS, json(200, page([dealBody(1, { outcome: 'won' })]))),
      route('GET', CALLS, json(200, page([])))
    )
    const list = await tiles()
    await waitFor(() => expect(list.getByRole('link', { name: /^Members: 3\./ })).toBeTruthy())
    await waitFor(() => expect(list.getByRole('link', { name: /^Documents: 2\+\./ })).toBeTruthy())
    await waitFor(() => expect(list.getByRole('link', { name: /^Won Deals: 1\./ })).toBeTruthy())
    await waitFor(() => expect(list.getByRole('link', { name: /^Calls: 0\./ })).toBeTruthy())
    // Only won Deals are counted: the Outcome goes to the service as a filter.
    const deals = portal.calls.find((call) => call.path === DEALS)
    expect(new URL(deals?.url ?? '', 'http://x').searchParams.get('outcome')).toBe('won')
  })

  test('a Rep sees the documents count only, and nothing it may not read is requested', async () => {
    const portal = visit('rep', route('GET', DOCS, json(200, page([documentBody(1)]))))
    const list = await tiles()
    await waitFor(() => expect(list.getByRole('link', { name: /^Documents: 1\./ })).toBeTruthy())
    expect(list.getAllByRole('listitem')).toHaveLength(1)
    expect(portal.calls.some((call) => call.path === MEMBERS)).toBe(false)
    expect(portal.calls.some((call) => call.path === DEALS || call.path === CALLS)).toBe(false)
    expect(screen.queryByRole('link', { name: 'Invite people' })).toBeNull()
  })

  test('a count that cannot be read shows a dash, not a number', async () => {
    visit(
      'manager',
      route('GET', MEMBERS, failure(403, 'auth.forbidden')),
      route('GET', DOCS, json(200, page([])))
    )
    const list = await tiles()
    await waitFor(() => expect(list.getByRole('link', { name: /^Members: -\./ })).toBeTruthy())
  })

  test('the newest documents are listed as text, never as links or markup', async () => {
    const name = '<img src=x onerror=alert(1)>.pdf'
    visit('rep', route('GET', DOCS, json(200, page([documentBody(1, { fileName: name })]))))
    const recent = within(await screen.findByRole('region', { name: 'Recent documents' }))
    const cell = await recent.findByText(name)
    expect(cell.tagName).toBe('BDI')
    expect(cell.closest('a')).toBeNull()
    expect(document.querySelector('img[src="x"]')).toBeNull()
  })

  test('quick actions follow the role', async () => {
    visit(
      'owner',
      route('GET', MEMBERS, json(200, page([]))),
      route('GET', DOCS, json(200, page([]))),
      route('GET', DEALS, json(200, page([]))),
      route('GET', CALLS, json(200, page([callBody(1)])))
    )
    const actions = within(await screen.findByRole('region', { name: 'Quick actions' }))
    expect(actions.getByRole('link', { name: /Invite people/ }).getAttribute('href')).toBe(
      '/invitations'
    )
    expect(actions.getByRole('link', { name: /Upload documents/ })).toBeTruthy()
    expect(actions.getByRole('link', { name: /Upload a Call/ })).toBeTruthy()
  })
})
