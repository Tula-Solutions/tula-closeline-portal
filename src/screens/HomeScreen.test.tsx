import { describe, expect, test } from 'bun:test'
import { screen, waitFor, within } from '@testing-library/react'
import { MAX_PAGE_SIZE } from 'tula-closeline-contract'
import {
  callBody,
  dealBody,
  documentBody,
  importBody,
  memberBody,
  page,
} from '~/testing/core-bodies'
import { failure, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const MEMBERS = '/v1/members'
const DOCS = '/v1/playbook/documents'
const DEALS = '/v1/playbook/deals'
const CALLS = '/v1/playbook/calls'
const IMPORTS = '/v1/playbook/deal-imports'

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

async function counts() {
  return within(await screen.findByRole('list', { name: 'Your Organization in numbers' }))
}

describe('home: the briefing', () => {
  test('an Owner reads a sentence for members, documents, won Deals and Calls, with more pages shown as +', async () => {
    const portal = visit(
      'owner',
      route('GET', MEMBERS, json(200, page([memberBody(1), memberBody(2), memberBody(3)]))),
      route('GET', DOCS, json(200, page([documentBody(1), documentBody(2)], 'c2'))),
      route('GET', DEALS, json(200, page([dealBody(1, { outcome: 'won' })]))),
      route('GET', CALLS, json(200, page([])))
    )
    const list = await counts()
    await waitFor(() =>
      expect(list.getByRole('link', { name: /^3 Members in the Organization\.$/ })).toBeTruthy()
    )
    await waitFor(() =>
      expect(list.getByRole('link', { name: /^2\+ Documents in the Playbook\.$/ })).toBeTruthy()
    )
    await waitFor(() =>
      expect(list.getByRole('link', { name: /^1 won Deal in search\.$/ })).toBeTruthy()
    )
    await waitFor(() =>
      expect(list.getByRole('link', { name: /^0 Calls on record\.$/ })).toBeTruthy()
    )
    // Only won Deals are counted: the Outcome goes to the service as a filter.
    const deals = portal.calls.find((call) => call.path === DEALS)
    expect(new URL(deals?.url ?? '', 'http://x').searchParams.get('outcome')).toBe('won')
  })

  test('each count reads one page at the largest page size and never follows the next cursor', async () => {
    const full = Array.from({ length: MAX_PAGE_SIZE }, (_, index) => memberBody(index + 1))
    const portal = visit(
      'owner',
      route('GET', MEMBERS, json(200, page(full, 'next'))),
      route('GET', DOCS, json(200, page([]))),
      route('GET', DEALS, json(200, page([]))),
      route('GET', CALLS, json(200, page([])))
    )
    const list = await counts()
    await waitFor(() =>
      expect(
        list.getByRole('link', { name: `${MAX_PAGE_SIZE}+ Members in the Organization.` })
      ).toBeTruthy()
    )
    for (const path of [MEMBERS, DOCS, DEALS, CALLS]) {
      const sent = portal.calls.filter((call) => call.path === path)
      expect(sent).toHaveLength(1)
      const params = new URL(sent[0]?.url ?? '', 'http://x').searchParams
      expect(params.get('limit')).toBe(String(MAX_PAGE_SIZE))
      expect(params.get('cursor')).toBeNull()
    }
  })

  test('a count reads as a link before hover: it is underlined at rest, and the list keeps its role', async () => {
    visit('rep', route('GET', DOCS, json(200, page([documentBody(1)]))))
    const numbers = await screen.findByRole('list', { name: 'Your Organization in numbers' })
    expect(numbers.getAttribute('role')).toBe('list')
    const link = await within(numbers).findByRole('link', {
      name: /^1 Document in the Playbook\.$/,
    })
    // The words carry the underline (the numeral does not), and the whole link draws it on hover.
    expect(link.classList.contains('ink-hover')).toBe(true)
    expect(link.querySelector('.ink-link')?.textContent).toBe('Document in the Playbook.')
  })

  test('the numeral is written once, as text the screen reader reads, and drawn for sight only', async () => {
    visit('rep', route('GET', DOCS, json(200, page([documentBody(1), documentBody(2)], 'c2'))))
    const numbers = await counts()
    const link = await numbers.findByRole('link', { name: /^2\+ Documents in the Playbook\.$/ })
    const drawn = link.querySelector('[aria-hidden="true"]')
    await waitFor(() => expect(drawn?.textContent).toBe('2+'))
  })

  test('an Owner sees this week: Calls added in the last seven days and the last import', async () => {
    const now = Date.now()
    const recent = new Date(now - 2 * 24 * 3600 * 1000).toISOString().replace(/\.\d+Z$/, 'Z')
    const old = new Date(now - 20 * 24 * 3600 * 1000).toISOString().replace(/\.\d+Z$/, 'Z')
    const calls = [
      { ...callBody(1, { fileName: 'kickoff.txt', state: 'ready' }), createdAt: recent },
      { ...callBody(2, { fileName: 'old.txt' }), createdAt: old },
    ]
    const portal = visit(
      'owner',
      route('GET', MEMBERS, json(200, page([]))),
      route('GET', DOCS, json(200, page([]))),
      route('GET', DEALS, json(200, page([]))),
      route('GET', CALLS, json(200, page(calls))),
      route(
        'GET',
        IMPORTS,
        json(
          200,
          page([
            {
              ...importBody(1),
              state: 'completed',
              rowCount: 13,
              appliedCount: 12,
              createdAt: recent,
            },
          ])
        )
      )
    )
    const week = await screen.findByRole('region', { name: 'This week' })
    await waitFor(() => expect(within(week).getByText('kickoff.txt')).toBeTruthy())
    expect(within(week).queryByText('old.txt')).toBeNull()
    await waitFor(() => expect(week.textContent).toContain('Last import, 12 rows applied'))
    // One page of one import, and the Calls line and this week share a single Calls read.
    const imports = portal.calls.filter((call) => call.path === IMPORTS)
    expect(imports).toHaveLength(1)
    expect(new URL(imports[0]?.url ?? '', 'http://x').searchParams.get('limit')).toBe('1')
    expect(portal.calls.filter((call) => call.path === CALLS)).toHaveLength(1)
  })

  test('a Rep is not shown this week and no import is requested', async () => {
    const portal = visit('rep', route('GET', DOCS, json(200, page([]))))
    await counts()
    expect(screen.queryByRole('region', { name: 'This week' })).toBeNull()
    expect(portal.calls.some((call) => call.path === IMPORTS)).toBe(false)
  })

  test('a Rep sees the documents count only, and nothing it may not read is requested', async () => {
    const portal = visit('rep', route('GET', DOCS, json(200, page([documentBody(1)]))))
    const list = await counts()
    await waitFor(() =>
      expect(list.getByRole('link', { name: /^1 Document in the Playbook\.$/ })).toBeTruthy()
    )
    expect(list.getAllByRole('listitem')).toHaveLength(1)
    expect(portal.calls.some((call) => call.path === MEMBERS)).toBe(false)
    expect(portal.calls.some((call) => call.path === DEALS || call.path === CALLS)).toBe(false)
    expect(screen.queryByRole('link', { name: 'Invite people' })).toBeNull()
  })

  test('every count link is named by the words it shows, loading, unread or counted, and stands on its own line on a phone', async () => {
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    visit(
      'manager',
      route('GET', MEMBERS, failure(403, 'auth.forbidden')),
      route('GET', DOCS, async () => {
        await held
        return json(200, page([documentBody(1)]))
      })
    )
    const list = await counts()
    const named = () =>
      list.getAllByRole('link').map((link) => ({
        label: link.getAttribute('aria-label'),
        text: link.textContent?.trim(),
      }))
    const loading = await list.findByRole('link', { name: 'Documents: loading' })
    expect(loading.textContent?.trim()).toBe('Documents: loading')
    await list.findByRole('link', { name: 'Members could not be counted.' })
    release()
    await list.findByRole('link', { name: '1 Document in the Playbook.' })
    for (const { label, text } of named()) {
      expect(label).toBeNull()
      expect(text).toBeTruthy()
    }
    for (const item of list.getAllByRole('listitem')) {
      expect(item.className.split(/\s+/)).toEqual(expect.arrayContaining(['block', 'sm:inline']))
    }
  })

  test('a count that cannot be read says so, not a number', async () => {
    visit(
      'manager',
      route('GET', MEMBERS, failure(403, 'auth.forbidden')),
      route('GET', DOCS, json(200, page([])))
    )
    const list = await counts()
    await waitFor(() =>
      expect(list.getByRole('link', { name: 'Members could not be counted.' })).toBeTruthy()
    )
  })

  test('the newest documents are listed as text, never as links or markup', async () => {
    const name = '<img src=x onerror=alert(1)>.pdf'
    visit('rep', route('GET', DOCS, json(200, page([documentBody(1, { fileName: name })]))))
    const recent = within(await screen.findByRole('region', { name: 'Latest' }))
    const cell = await recent.findByText(name)
    expect(cell.tagName).toBe('BDI')
    expect(cell.closest('a')).toBeNull()
    expect(document.querySelector('img[src="x"]')).toBeNull()
  })

  test('the next steps follow the role', async () => {
    visit(
      'owner',
      route('GET', MEMBERS, json(200, page([]))),
      route('GET', DOCS, json(200, page([]))),
      route('GET', DEALS, json(200, page([]))),
      route('GET', CALLS, json(200, page([callBody(1)])))
    )
    const actions = within(await screen.findByRole('navigation', { name: 'Next' }))
    expect(actions.getByRole('link', { name: /Invite people/ }).getAttribute('href')).toBe(
      '/invitations'
    )
    expect(actions.getByRole('link', { name: /Upload documents/ })).toBeTruthy()
    expect(actions.getByRole('link', { name: /Upload a Call/ })).toBeTruthy()
  })
})
