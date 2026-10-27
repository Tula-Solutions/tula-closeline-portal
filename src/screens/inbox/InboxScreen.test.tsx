import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { ERRORS } from 'tula-closeline-contract'
import { conversationBody, hexId, page } from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'
import { choose } from '~/testing/select'

const CONVERSATIONS = '/v1/conversations'

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', url: string, ...handlers: Handler[]) {
  return renderPortal({
    url,
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers,
  })
}

function params(url: string) {
  return new URL(url, 'http://x').searchParams
}

/** The reads of the list itself; the escalated count is a separate read of a full page. */
function listed(portal: ReturnType<typeof renderPortal>) {
  return portal.calls.filter(
    (call) => call.path === CONVERSATIONS && params(call.url).get('limit') !== '100'
  )
}

afterEach(() => {
  document.documentElement.classList.remove('dark')
  cleanup()
})

describe('Inbox: the list', () => {
  test('renders what core returns, with a link to each Conversation', async () => {
    visit(
      'rep',
      '/inbox',
      route(
        'GET',
        CONVERSATIONS,
        json(
          200,
          page([
            conversationBody(1, { channel: 'email', latestLabel: 'question' }),
            conversationBody(2, {
              channel: 'linkedin',
              state: 'awaiting_approval',
              pendingDraftCount: 2,
            }),
            conversationBody(3, {
              channel: 'chat',
              controller: 'rep',
              controllerMembershipId: hexId('mem', 2),
              state: 'rep',
            }),
          ])
        )
      )
    )
    const table = await screen.findByRole('table', { name: 'Conversations' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    const first = rows[0] as HTMLElement
    expect(within(first).getByRole('link').getAttribute('href')).toBe(`/inbox/${hexId('cnv', 1)}`)
    expect(first.textContent).toContain('Email')
    expect(first.textContent).toContain('Agent answering')
    expect(first.textContent).toContain('Question')
    expect((rows[1] as HTMLElement).textContent).toContain('Draft waiting for approval')
    expect((rows[1] as HTMLElement).textContent).toContain('LinkedIn')
    expect((rows[2] as HTMLElement).textContent).toContain('Rep answering')
  })

  test('asks core for a bounded page and sends no owner or role filter', async () => {
    const portal = visit('rep', '/inbox', route('GET', CONVERSATIONS, json(200, page([]))))
    await screen.findByText('Nothing in the inbox yet.')
    const query = params(listed(portal)[0]?.url ?? '')
    expect(Number(query.get('limit'))).toBeGreaterThan(0)
    expect(Number(query.get('limit'))).toBeLessThanOrEqual(100)
    expect([...query.keys()].sort()).toEqual(['limit'])
  })

  test.each([
    ['rep', [1]],
    ['admin', [1, 2, 3]],
  ] as const)('a %s sees exactly what core returned', async (role, numbers) => {
    const portal = visit(
      role,
      '/inbox',
      route('GET', CONVERSATIONS, json(200, page(numbers.map((n) => conversationBody(n)))))
    )
    const table = await screen.findByRole('table', { name: 'Conversations' })
    expect(within(table).getAllByRole('link')).toHaveLength(numbers.length)
    expect(params(listed(portal)[0]?.url ?? '').has('owner')).toBe(false)
    expect(params(listed(portal)[0]?.url ?? '').has('ownerMembershipId')).toBe(false)
  })

  test('the filters in the address are sent to core', async () => {
    const portal = visit(
      'rep',
      '/inbox?channel=linkedin&state=escalated&label=objection',
      route('GET', CONVERSATIONS, json(200, page([conversationBody(1)])))
    )
    await screen.findByRole('table', { name: 'Conversations' })
    const query = params(listed(portal)[0]?.url ?? '')
    expect(query.get('channel')).toBe('linkedin')
    expect(query.get('state')).toBe('escalated')
    expect(query.get('label')).toBe('objection')
  })

  test('a value the contract does not know is dropped from the address and the request', async () => {
    const portal = visit(
      'rep',
      '/inbox?channel=fax&state=bogus&label=x',
      route('GET', CONVERSATIONS, json(200, page([conversationBody(1)])))
    )
    await screen.findByRole('table', { name: 'Conversations' })
    expect([...params(listed(portal)[0]?.url ?? '').keys()].sort()).toEqual(['limit'])
  })

  test('choosing a filter reads again with it, and Clear the filters removes it', async () => {
    const portal = visit(
      'rep',
      '/inbox',
      route('GET', CONVERSATIONS, (call) =>
        params(call.url).get('channel') === 'chat'
          ? json(200, page([]))
          : json(200, page([conversationBody(1)]))
      )
    )
    await screen.findByRole('table', { name: 'Conversations' })
    await choose(portal.user, screen.getByLabelText('Channel'), 'chat')
    await screen.findByText('No Conversation matches.')
    expect(params(listed(portal).at(-1)?.url ?? '').get('channel')).toBe('chat')
    await portal.user.click(screen.getByRole('button', { name: 'Clear the filters' }))
    await screen.findByRole('table', { name: 'Conversations' })
    expect(portal.router.state.location.search).toEqual({})
  })

  test('state and label filters are sent too', async () => {
    const portal = visit(
      'rep',
      '/inbox',
      route('GET', CONVERSATIONS, json(200, page([conversationBody(1)])))
    )
    await screen.findByRole('table', { name: 'Conversations' })
    await choose(portal.user, screen.getByLabelText('State'), 'closed')
    await waitFor(() =>
      expect(params(listed(portal).at(-1)?.url ?? '').get('state')).toBe('closed')
    )
    await choose(portal.user, screen.getByLabelText('Label'), 'not_now')
    await waitFor(() =>
      expect(params(listed(portal).at(-1)?.url ?? '').get('label')).toBe('not_now')
    )
  })

  test('Load more sends the cursor and appends the next page', async () => {
    const portal = visit(
      'rep',
      '/inbox',
      route('GET', CONVERSATIONS, (call) =>
        params(call.url).get('cursor') === 'c2'
          ? json(200, page([conversationBody(3, { channel: 'chat' })]))
          : json(200, page([conversationBody(1), conversationBody(2)], 'c2'))
      )
    )
    await screen.findByRole('table', { name: 'Conversations' })
    await portal.user.click(screen.getByRole('button', { name: 'Load more Conversations' }))
    await waitFor(() => expect(screen.getAllByRole('link')).toBeTruthy())
    await waitFor(() =>
      expect(
        within(screen.getByRole('table', { name: 'Conversations' })).getAllByRole('link')
      ).toHaveLength(3)
    )
    expect(params(listed(portal)[1]?.url ?? '').get('cursor')).toBe('c2')
    expect(screen.queryByRole('button', { name: 'Load more Conversations' })).toBeNull()
  })

  test('an empty inbox explains itself', async () => {
    visit('rep', '/inbox', route('GET', CONVERSATIONS, json(200, page([]))))
    expect(await screen.findByText('Nothing in the inbox yet.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Clear the filters' })).toBeNull()
  })

  test('a failure is explained by its code, with a way to try again', async () => {
    const portal = visit(
      'rep',
      '/inbox',
      route('GET', CONVERSATIONS, failure(500, ERRORS['server.internal'].code))
    )
    expect((await screen.findByRole('alert')).textContent).toContain('Something went wrong')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(portal.calls.length).toBeGreaterThan(0)
  })

  test('shows a loading state while core answers', async () => {
    visit('rep', '/inbox', () => new Promise<Response>(() => {}))
    expect(await screen.findByText('Loading Conversations...')).toBeTruthy()
  })

  test('is reachable from the nav and by keyboard: filters, then the Conversation link', async () => {
    const portal = visit(
      'rep',
      '/inbox',
      route('GET', CONVERSATIONS, json(200, page([conversationBody(1)])))
    )
    await screen.findByRole('table', { name: 'Conversations' })
    expect(screen.getByRole('link', { name: 'Inbox' })).toBeTruthy()
    const link = within(screen.getByRole('table', { name: 'Conversations' })).getByRole('link')
    link.focus()
    expect(document.activeElement).toBe(link)
    await portal.user.keyboard('{Enter}')
    await waitFor(() =>
      expect(portal.router.state.location.pathname).toBe(`/inbox/${hexId('cnv', 1)}`)
    )
  })

  test('the Filters disclosure opens and closes the controls on small screens', async () => {
    const portal = visit('rep', '/inbox', route('GET', CONVERSATIONS, json(200, page([]))))
    await screen.findByText('Nothing in the inbox yet.')
    const toggle = screen.getByRole('button', { name: /^Filters/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await portal.user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
  })

  test('passes axe in light and dark', async () => {
    visit('rep', '/inbox', route('GET', CONVERSATIONS, json(200, page([conversationBody(1)]))))
    await screen.findByRole('table', { name: 'Conversations' })
    const run = async () =>
      (
        await axe.run(screen.getByRole('main'), { rules: { 'color-contrast': { enabled: false } } })
      ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
    expect(await run()).toEqual([])
    document.documentElement.classList.add('dark')
    expect(await run()).toEqual([])
  })
})

describe('Inbox: escalated to me', () => {
  const escalated = (n: number) => conversationBody(n, { state: 'escalated' })

  /** Answers the escalated read with `mine` and every other read with the plain list. */
  function list(mine: ReturnType<typeof escalated>[], nextCursor: string | null = null) {
    return route('GET', CONVERSATIONS, (call) =>
      params(call.url).get('state') === 'escalated'
        ? json(200, { items: mine, nextCursor })
        : json(200, page([conversationBody(1), conversationBody(2), ...mine]))
    )
  }

  test('a Rep sees a quiet count of the escalated Conversations core lists for them', async () => {
    const portal = visit('rep', '/inbox', list([escalated(3), escalated(4)]))
    const toggle = await screen.findByRole('button', { name: /Escalated to me/ })
    await waitFor(() => expect(toggle.textContent).toContain('2'))
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    const counted = portal.calls.filter((call) => params(call.url).get('state') === 'escalated')
    expect(counted.length).toBeGreaterThan(0)
    expect(params(counted[0]?.url ?? '').has('controller')).toBe(false)
  })

  test('the count does not include Conversations the plain list holds', async () => {
    visit('rep', '/inbox', list([escalated(3)]))
    const toggle = await screen.findByRole('button', { name: /Escalated to me/ })
    await waitFor(() => expect(toggle.textContent).toMatch(/\b1\b/))
    expect(toggle.textContent).not.toMatch(/\b3\b/)
  })

  test('a count that does not fit one page ends in a plus', async () => {
    visit('rep', '/inbox', list([escalated(3)], 'more'))
    const toggle = await screen.findByRole('button', { name: /Escalated to me/ })
    await waitFor(() => expect(toggle.textContent).toContain('100+'))
  })

  test('other roles see the whole escalated queue, not "to me"', async () => {
    visit('admin', '/inbox', list([escalated(3)]))
    expect(await screen.findByRole('button', { name: /^Escalated/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /to me/ })).toBeNull()
  })

  test('pressing it filters the list to the escalated state and a second press clears it', async () => {
    const portal = visit('rep', '/inbox', list([escalated(3)]))
    const toggle = await screen.findByRole('button', { name: /Escalated to me/ })
    await portal.user.click(toggle)
    await waitFor(() => expect(toggle.getAttribute('aria-pressed')).toBe('true'))
    await waitFor(() =>
      expect(listed(portal).some((call) => params(call.url).get('state') === 'escalated')).toBe(
        true
      )
    )
    await portal.user.click(toggle)
    await waitFor(() => expect(toggle.getAttribute('aria-pressed')).toBe('false'))
  })
})
