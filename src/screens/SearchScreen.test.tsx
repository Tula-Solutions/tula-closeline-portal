import { describe, expect, test } from 'bun:test'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { hexId } from '~/testing/core-bodies'
import { failure, json, route, tokens } from '~/testing/fixtures'
import { visit } from '~/testing/sales'

const SEARCH = '/v1/playbook/search/moments'
const URL = '/sales-history/search'

const match = (n: number, over: Record<string, unknown> = {}) => ({
  callId: hexId('call', n),
  dealRecordId: hexId('deal', n),
  score: 0.8312,
  prospect: `Prospect line ${n}`,
  repNext: `Rep line ${n}`,
  ...over,
})
const answer = (items: unknown[], evidence = { moments: 12, deals: 4 }) =>
  json(200, { items, evidence })

const open = (role: 'owner' | 'admin' | 'manager' | 'rep', response = answer([match(1)])) =>
  visit(URL, role, [route('POST', SEARCH, response)])
const searches = (portal: ReturnType<typeof open>) =>
  portal.calls.filter((call) => call.path === SEARCH)

describe('search over won Deals: who may use it', () => {
  test.each(['owner', 'admin'] as const)('an %s sees the form and the menu entry', async (role) => {
    open(role)
    expect(await screen.findByRole('heading', { name: 'Search won Deals' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Search' })).toBeTruthy()
  })

  test.each(['manager', 'rep'] as const)(
    'a %s gets the not-allowed state and sends nothing',
    async (role) => {
      const portal = open(role)
      expect(await screen.findByRole('heading', { name: 'Not allowed' })).toBeTruthy()
      expect(screen.queryByRole('link', { name: 'Search' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Search' })).toBeNull()
      expect(searches(portal)).toHaveLength(0)
    }
  )
})

describe('search over won Deals: the request', () => {
  const fill = async (portal: ReturnType<typeof open>, text: string) => {
    await portal.user.type(await screen.findByLabelText('What was said, turn 1'), text)
  }
  const submit = (portal: ReturnType<typeof open>) =>
    portal.user.click(screen.getByRole('button', { name: 'Search' }))

  test('sends the turns and the limit as the contract says', async () => {
    const portal = open('owner')
    await fill(portal, 'We need it cheaper')
    await portal.user.selectOptions(screen.getByLabelText('Role, turn 1'), 'prospect')
    await portal.user.click(screen.getByRole('button', { name: 'Add a turn' }))
    await portal.user.type(screen.getByLabelText('What was said, turn 2'), 'Let me check')
    await portal.user.selectOptions(screen.getByLabelText('Number of results'), '10')
    await submit(portal)
    await waitFor(() => expect(searches(portal)).toHaveLength(1))
    expect(searches(portal)[0]?.body).toEqual({
      turns: [
        { role: 'prospect', text: 'We need it cheaper' },
        { role: 'rep', text: 'Let me check' },
      ],
      limit: 10,
    })
  })

  test('offers a limit of 5, 10 or 20, starting at 5', async () => {
    open('owner')
    const select = (await screen.findByLabelText('Number of results')) as HTMLSelectElement
    expect(select.value).toBe('5')
    expect([...select.options].map((option) => option.value)).toEqual(['5', '10', '20'])
  })

  test('allows at most six turns, and removes one on request', async () => {
    const portal = open('owner')
    await screen.findByLabelText('What was said, turn 1')
    for (let i = 0; i < 5; i += 1) {
      await portal.user.click(screen.getByRole('button', { name: 'Add a turn' }))
    }
    expect(screen.getByLabelText('What was said, turn 6')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add a turn' })).toBeNull()
    await portal.user.click(screen.getByRole('button', { name: 'Remove turn 6' }))
    expect(screen.queryByLabelText('What was said, turn 6')).toBeNull()
    expect(screen.getByRole('button', { name: 'Add a turn' })).toBeTruthy()
  })

  test('the last turn cannot be removed', async () => {
    open('owner')
    await screen.findByLabelText('What was said, turn 1')
    expect(screen.queryByRole('button', { name: 'Remove turn 1' })).toBeNull()
  })

  test('a turn of only whitespace is refused before anything is sent', async () => {
    const portal = open('owner')
    await fill(portal, '   ')
    await submit(portal)
    const field = screen.getByLabelText('What was said, turn 1')
    await waitFor(() => expect(field.getAttribute('aria-invalid')).toBe('true'))
    expect(searches(portal)).toHaveLength(0)
    expect(document.activeElement).toBe(field)
  })

  test('an empty turn is told to be filled in, not that it holds only spaces', async () => {
    const portal = open('owner')
    await fill(portal, 'We need it cheaper')
    await portal.user.click(screen.getByRole('button', { name: 'Add a turn' }))
    await submit(portal)
    const field = screen.getByLabelText('What was said, turn 2')
    await waitFor(() => expect(field.getAttribute('aria-invalid')).toBe('true'))
    const message = document.getElementById(field.getAttribute('aria-describedby') ?? '')
    expect(message?.textContent).toContain('Write some words in this turn')
    expect(message?.textContent).not.toContain('spaces')
    expect(searches(portal)).toHaveLength(0)
  })

  test('more than 2000 characters in all is refused before anything is sent', async () => {
    const portal = open('owner')
    await screen.findByLabelText('What was said, turn 1')
    fireEvent.change(screen.getByLabelText('What was said, turn 1'), {
      target: { value: 'a'.repeat(1500) },
    })
    await portal.user.click(screen.getByRole('button', { name: 'Add a turn' }))
    fireEvent.change(screen.getByLabelText('What was said, turn 2'), {
      target: { value: 'b'.repeat(501) },
    })
    await submit(portal)
    expect((await screen.findAllByText(/2000 characters/)).length).toBeGreaterThan(0)
    expect(searches(portal)).toHaveLength(0)
  })

  test('one turn of 3000 characters gets the character-limit message', async () => {
    const portal = open('owner')
    await screen.findByLabelText('What was said, turn 1')
    fireEvent.change(screen.getByLabelText('What was said, turn 1'), {
      target: { value: 'a'.repeat(3000) },
    })
    await submit(portal)
    const field = screen.getByLabelText('What was said, turn 1')
    await waitFor(() => expect(field.getAttribute('aria-invalid')).toBe('true'))
    const text = document.getElementById(field.getAttribute('aria-describedby') ?? '')?.textContent
    expect(text).toContain('2000 characters')
    expect(text).not.toContain('spaces')
    expect(searches(portal)).toHaveLength(0)
  })

  test('a turn with characters that cannot be read says so', async () => {
    const portal = open('owner')
    await screen.findByLabelText('What was said, turn 1')
    fireEvent.change(screen.getByLabelText('What was said, turn 1'), {
      target: { value: 'broken \uD800 text' },
    })
    await submit(portal)
    const field = screen.getByLabelText('What was said, turn 1')
    await waitFor(() => expect(field.getAttribute('aria-invalid')).toBe('true'))
    const text = document.getElementById(field.getAttribute('aria-describedby') ?? '')?.textContent
    expect(text).toContain("characters we can't read")
    expect(searches(portal)).toHaveLength(0)
  })

  test('one submit reports every turn that needs fixing', async () => {
    const portal = open('owner')
    await screen.findByLabelText('What was said, turn 1')
    fireEvent.change(screen.getByLabelText('What was said, turn 1'), {
      target: { value: 'a'.repeat(3000) },
    })
    await portal.user.click(screen.getByRole('button', { name: 'Add a turn' }))
    await submit(portal)
    await waitFor(() =>
      expect(screen.getByLabelText('What was said, turn 1').getAttribute('aria-invalid')).toBe(
        'true'
      )
    )
    expect(screen.getByLabelText('What was said, turn 2').getAttribute('aria-invalid')).toBe('true')
  })

  test('exactly 2000 characters is sent', async () => {
    const portal = open('owner')
    await screen.findByLabelText('What was said, turn 1')
    fireEvent.change(screen.getByLabelText('What was said, turn 1'), {
      target: { value: 'a'.repeat(2000) },
    })
    await submit(portal)
    await waitFor(() => expect(searches(portal)).toHaveLength(1))
  })
})

describe('search over won Deals: the answer', () => {
  const ask = async (portal: ReturnType<typeof open>) => {
    await portal.user.type(await screen.findByLabelText('What was said, turn 1'), 'price')
    await portal.user.click(screen.getByRole('button', { name: 'Search' }))
  }

  test('lists each Moment with both snippets, the links, a rounded score and the evidence', async () => {
    const portal = open(
      'owner',
      answer([match(1), match(2, { score: 0.5 })], { moments: 12, deals: 4 })
    )
    await ask(portal)
    const list = await screen.findByRole('list', { name: 'Matching Moments' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    const first = rows[0] as HTMLElement
    expect(within(first).getByText('Prospect said')).toBeTruthy()
    expect(within(first).getByText('Prospect line 1')).toBeTruthy()
    expect(within(first).getByText('Rep said next')).toBeTruthy()
    expect(within(first).getByText('Rep line 1')).toBeTruthy()
    expect(first.textContent).toContain('83%')
    expect((rows[1] as HTMLElement).textContent).toContain('50%')
    const deal = within(first).getByRole('link', { name: 'Deal for Moment 1' })
    expect(deal.getAttribute('href')).toBe(`/sales-history/deals/${hexId('deal', 1)}`)
    const call = within(first).getByRole('link', { name: 'Calls of this Deal for Moment 1' })
    expect(call.getAttribute('href')).toContain(`deal=${hexId('deal', 1)}`)
    expect(
      screen.getByText('Based on 12 Moments from won Deals across 4 Deals in this search')
    ).toBeTruthy()
  })

  test('the evidence wording is singular for one and never claims the whole history', async () => {
    const portal = open('owner', answer([match(1)], { moments: 1, deals: 1 }))
    await ask(portal)
    const text = (
      await screen.findByText(/Based on 1 Moment from won Deals across 1 Deal in this search/)
    ).textContent
    expect(text).not.toMatch(/all|every|whole|entire/i)
  })

  test('snippets are untrusted: shown as text, never as markup', async () => {
    const hostile = '<img src=x onerror=alert(1)> <b>bold</b> evil'
    const portal = open(
      'owner',
      answer([match(1, { prospect: hostile, repNext: '<script>x()</script>' })])
    )
    await ask(portal)
    expect(await screen.findByText(hostile)).toBeTruthy()
    expect(screen.getByText('<script>x()</script>')).toBeTruthy()
    expect(document.querySelector('img[src="x"]')).toBeNull()
    expect(document.querySelector('main script, main b')).toBeNull()
  })

  test('the links of each result have names of their own', async () => {
    const portal = open('owner', answer([match(1), match(2)]))
    await ask(portal)
    await screen.findByRole('list', { name: 'Matching Moments' })
    const names = within(screen.getByRole('list', { name: 'Matching Moments' }))
      .getAllByRole('link')
      .map((link) => link.getAttribute('aria-label') ?? link.textContent)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain('Deal for Moment 2')
    expect(names).toContain('Calls of this Deal for Moment 2')
  })

  test('a failed search moves focus to the error', async () => {
    const portal = open('owner', failure(504, 'server.timeout'))
    await ask(portal)
    const alert = await screen.findByRole('alert')
    await waitFor(() => expect(document.activeElement).toBe(alert))
  })

  test('editing the turns or the limit clears the old results', async () => {
    const portal = open('owner', answer([match(1)]))
    await ask(portal)
    await screen.findByRole('list', { name: 'Matching Moments' })
    await portal.user.type(screen.getByLabelText('What was said, turn 1'), 'x')
    expect(screen.queryByRole('list', { name: 'Matching Moments' })).toBeNull()
    await ask(portal)
    await screen.findByRole('list', { name: 'Matching Moments' })
    await portal.user.selectOptions(screen.getByLabelText('Number of results'), '10')
    expect(screen.queryByRole('list', { name: 'Matching Moments' })).toBeNull()
  })

  test('an answer that arrives after an edit is not shown', async () => {
    let release: (response: Response) => void = () => undefined
    const late = new Promise<Response>((resolve) => {
      release = resolve
    })
    const portal = visit(URL, 'owner', [route('POST', SEARCH, () => late)])
    await ask(portal)
    await portal.user.type(screen.getByLabelText('What was said, turn 1'), ' and more')
    release(answer([match(1)]))
    await new Promise((done) => setTimeout(done, 100))
    expect(screen.queryByRole('list', { name: 'Matching Moments' })).toBeNull()
  })

  test('a reply the portal cannot read shows a plain message', async () => {
    const portal = open('owner', json(200, { unexpected: true }))
    await ask(portal)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).not.toMatch(/client\.|bad_response|undefined|ZodError/)
    expect(alert.textContent?.length).toBeGreaterThan(20)
  })

  test('a 503 is asked once: search is never retried by itself', async () => {
    const portal = open(
      'owner',
      failure(503, 'server.unavailable', undefined, { 'retry-after': '1' })
    )
    await ask(portal)
    await screen.findByRole('alert')
    await new Promise((done) => setTimeout(done, 200))
    expect(searches(portal)).toHaveLength(1)
  })

  test('another Organization sees neither the old turns nor the old results', async () => {
    const portal = visit(URL, 'owner', [
      route('POST', SEARCH, answer([match(1)])),
      route('POST', '/v1/client/sessions/refresh', () =>
        json(200, tokens({ accessToken: 'access-2', organization: { id: 'org_2', role: 'owner' } }))
      ),
    ])
    await ask(portal)
    await screen.findByRole('list', { name: 'Matching Moments' })
    // The answer is held by a mutation until the session changes; the check after must not be vacuous.
    expect(portal.app.queryClient.getMutationCache().getAll()).toHaveLength(1)
    await act(() => portal.app.session.refresh('access-1'))
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Matching Moments' })).toBeNull())
    expect((screen.getByLabelText('What was said, turn 1') as HTMLTextAreaElement).value).toBe('')
    expect(screen.queryByText('Prospect line 1')).toBeNull()
    expect(portal.app.queryClient.getMutationCache().getAll()).toHaveLength(0)
  })

  test('after sign-out the results and turns are gone', async () => {
    const portal = visit(URL, 'owner', [
      route('POST', SEARCH, answer([match(1)])),
      route('POST', '/v1/client/sessions/sign-out', json(204)),
    ])
    await ask(portal)
    await screen.findByRole('list', { name: 'Matching Moments' })
    expect(portal.app.queryClient.getMutationCache().getAll()).toHaveLength(1)
    await act(() => portal.app.session.signOut())
    await waitFor(() => expect(screen.queryByLabelText('What was said, turn 1')).toBeNull())
    expect(screen.queryByText('Prospect line 1')).toBeNull()
    expect(portal.app.queryClient.getMutationCache().getAll()).toHaveLength(0)
  })

  test('a score that is not between 0 and 1 is left out', async () => {
    const portal = open('owner', answer([match(1, { score: 7.4 })]))
    await ask(portal)
    const row = (await screen.findAllByRole('listitem')).find((item) =>
      item.textContent?.includes('Prospect line 1')
    ) as HTMLElement
    expect(row.textContent).not.toMatch(/%/)
  })

  test('an empty result has its own message and no list', async () => {
    const portal = open('owner', answer([], { moments: 0, deals: 0 }))
    await ask(portal)
    expect(await screen.findByText(/No Moments from won Deals matched/)).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Matching Moments' })).toBeNull()
    expect(screen.queryByText(/Based on/)).toBeNull()
  })

  test('503 shows the busy message with the Retry-After time', async () => {
    const portal = open(
      'owner',
      failure(503, 'server.unavailable', undefined, { 'retry-after': '7' })
    )
    await ask(portal)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Search is busy, try again')
    expect(alert.textContent).toContain('7 seconds')
  })

  test('503 without Retry-After still says to try again', async () => {
    const portal = open('owner', failure(503, 'server.unavailable'))
    await ask(portal)
    expect((await screen.findByRole('alert')).textContent).toContain('Search is busy, try again')
  })

  test('504 shows the too-long message', async () => {
    const portal = open('owner', failure(504, 'server.timeout'))
    await ask(portal)
    expect((await screen.findByRole('alert')).textContent).toContain('Search took too long')
  })

  test('the message follows the code, not the status', async () => {
    const portal = open('owner', failure(500, 'server.timeout'))
    await ask(portal)
    expect((await screen.findByRole('alert')).textContent).toContain('Search took too long')
  })

  test('a later search replaces the error of an earlier one', async () => {
    let tries = 0
    const portal = visit(URL, 'owner', [
      route('POST', SEARCH, () => {
        tries += 1
        return tries === 1 ? failure(503, 'server.unavailable') : answer([match(1)])
      }),
    ])
    await ask(portal)
    await screen.findByRole('alert')
    await portal.user.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByRole('list', { name: 'Matching Moments' })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
