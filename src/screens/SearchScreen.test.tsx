import { describe, expect, test } from 'bun:test'
import { screen, waitFor, within } from '@testing-library/react'
import { hexId } from '~/testing/core-bodies'
import { failure, json, route } from '~/testing/fixtures'
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
    await portal.user.selectOptions(screen.getByLabelText('Results'), '10')
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
    const select = (await screen.findByLabelText('Results')) as HTMLSelectElement
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
    const { fireEvent } = await import('@testing-library/react')
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

  test('exactly 2000 characters is sent', async () => {
    const portal = open('owner')
    const { fireEvent } = await import('@testing-library/react')
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
    const list = await screen.findByRole('list', { name: 'Matching moments' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    const first = rows[0] as HTMLElement
    expect(within(first).getByText('Prospect said')).toBeTruthy()
    expect(within(first).getByText('Prospect line 1')).toBeTruthy()
    expect(within(first).getByText('Rep said next')).toBeTruthy()
    expect(within(first).getByText('Rep line 1')).toBeTruthy()
    expect(first.textContent).toContain('83%')
    expect((rows[1] as HTMLElement).textContent).toContain('50%')
    const deal = within(first).getByRole('link', { name: 'Deal' })
    expect(deal.getAttribute('href')).toBe(`/sales-history/deals/${hexId('deal', 1)}`)
    const call = within(first).getByRole('link', { name: 'Call' })
    expect(call.getAttribute('href')).toContain(`deal=${hexId('deal', 1)}`)
    expect(
      screen.getByText('Based on 12 won-deal moments across 4 deals in this search')
    ).toBeTruthy()
  })

  test('the evidence wording is singular for one and never claims the whole history', async () => {
    const portal = open('owner', answer([match(1)], { moments: 1, deals: 1 }))
    await ask(portal)
    const text = (
      await screen.findByText(/Based on 1 won-deal moment across 1 deal in this search/)
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
    expect(await screen.findByText(/No moments from won Deals matched/)).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Matching moments' })).toBeNull()
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
    await screen.findByRole('list', { name: 'Matching moments' })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
