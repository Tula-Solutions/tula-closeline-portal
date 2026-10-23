import { afterEach, describe, expect, test } from 'bun:test'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { callBody, dealBody, page, rightsBody } from '~/testing/core-bodies'
import { failure, json, route } from '~/testing/fixtures'
import { visit } from '~/testing/sales'
import { choose, optionsOf } from '~/testing/select'
import { formatDateOnly } from '~/ui/When'

const PB = '/v1/playbook'
const DEALS = `${PB}/deals`
const CALLS = `${PB}/calls`
const RIGHTS = `${PB}/rights-confirmation`

const realZone = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone
afterEach(() => {
  process.env.TZ = realZone
})

describe('a closing date is a calendar date', () => {
  test('is shown unchanged under TZ=America/Chicago, never moved to the day before', async () => {
    process.env.TZ = 'America/Chicago'
    expect(formatDateOnly('2026-01-31')).toBe('Jan 31, 2026')
    expect(formatDateOnly('2026-03-01')).toBe('Mar 1, 2026')
    const deal = dealBody(1, { outcome: 'won', closedAt: '2026-01-31' })
    visit('/sales-history/deals', 'owner', [route('GET', DEALS, json(200, page([deal])))])
    const row = (await screen.findByText('D-1')).closest('tr') as HTMLElement
    expect(row.textContent).toContain('Jan 31, 2026')
    expect(row.querySelector('time')?.getAttribute('datetime')).toBe('2026-01-31')
  })

  test('a value that is not a date is returned as it came', () => {
    expect(formatDateOnly('soon')).toBe('soon')
  })
})

describe('the Outcome form takes a date', () => {
  const deal = dealBody(1, { outcome: 'open', closedAt: null })
  const open = (d = deal) =>
    visit(`/sales-history/deals/${d.id}`, 'owner', [
      route('GET', `${DEALS}/${d.id}`, json(200, d)),
      route('PUT', `${DEALS}/${d.id}/outcome`, json(200, { ...d, outcome: 'won' })),
    ])
  const put = (portal: ReturnType<typeof open>) =>
    portal.calls.filter((call) => call.method === 'PUT')

  test('sends the chosen date as YYYY-MM-DD with the Outcome', async () => {
    const portal = open()
    await choose(portal.user, await screen.findByLabelText('Outcome'), 'won')
    const field = screen.getByLabelText(/Closing date/) as HTMLInputElement
    expect(field.type).toBe('date')
    await portal.user.type(field, '2026-01-31')
    await portal.user.click(screen.getByRole('button', { name: 'Save Outcome' }))
    await waitFor(() => expect(put(portal)).toHaveLength(1))
    expect(put(portal)[0]?.body).toEqual({ outcome: 'won', closedAt: '2026-01-31' })
  })

  test('with no date, sends the Outcome alone', async () => {
    const portal = open()
    await choose(portal.user, await screen.findByLabelText('Outcome'), 'won')
    await portal.user.click(screen.getByRole('button', { name: 'Save Outcome' }))
    await waitFor(() => expect(put(portal)).toHaveLength(1))
    expect(put(portal)[0]?.body).toEqual({ outcome: 'won' })
  })

  test('shows the date the Deal has, and clearing it sends null', async () => {
    const withDate = dealBody(2, { outcome: 'won', closedAt: '2026-01-31' })
    const portal = open(withDate)
    const field = (await screen.findByLabelText(/Closing date/)) as HTMLInputElement
    expect(field.value).toBe('2026-01-31')
    await portal.user.clear(field)
    await portal.user.click(screen.getByRole('button', { name: 'Save Outcome' }))
    await waitFor(() => expect(put(portal)).toHaveLength(1))
    expect(put(portal)[0]?.body).toEqual({ outcome: 'won', closedAt: null })
  })

  test('a date outside 1970 to 2100 is refused before anything is sent', async () => {
    const portal = open()
    await portal.user.type(await screen.findByLabelText(/Closing date/), '1900-01-01')
    await portal.user.click(screen.getByRole('button', { name: 'Save Outcome' }))
    const field = screen.getByLabelText(/Closing date/)
    await waitFor(() => expect(field.getAttribute('aria-invalid')).toBe('true'))
    expect(put(portal)).toHaveLength(0)
    expect(document.activeElement).toBe(field)
  })

  test('a half-typed date is refused and never clears the stored date', async () => {
    const withDate = dealBody(3, { outcome: 'won', closedAt: '2026-01-31' })
    const portal = open(withDate)
    const field = (await screen.findByLabelText(/Closing date/)) as HTMLInputElement
    // A browser reports a half-typed date as '' with validity.badInput set.
    Object.defineProperty(field, 'validity', { value: { badInput: true }, configurable: true })
    fireEvent.change(field, { target: { value: '' } })
    await portal.user.click(screen.getByRole('button', { name: 'Save Outcome' }))
    await waitFor(() => expect(field.getAttribute('aria-invalid')).toBe('true'))
    expect(put(portal)).toHaveLength(0)
  })

  test('an untouched date is not sent again with an Outcome-only save', async () => {
    const withDate = dealBody(4, { outcome: 'open', closedAt: '2026-01-31' })
    const portal = open(withDate)
    await choose(portal.user, await screen.findByLabelText('Outcome'), 'won')
    await portal.user.click(screen.getByRole('button', { name: 'Save Outcome' }))
    await waitFor(() => expect(put(portal)).toHaveLength(1))
    expect(put(portal)[0]?.body).toEqual({ outcome: 'won' })
  })

  test('after a save the date follows the service again', async () => {
    const withDate = dealBody(5, { outcome: 'open', closedAt: '2026-01-31' })
    let saved = false
    const portal = visit(`/sales-history/deals/${withDate.id}`, 'owner', [
      route('GET', `${DEALS}/${withDate.id}`, () =>
        json(200, saved ? { ...withDate, closedAt: '2026-03-05' } : withDate)
      ),
      route('PUT', `${DEALS}/${withDate.id}/outcome`, () => {
        saved = true
        return json(200, withDate)
      }),
    ])
    const field = (await screen.findByLabelText(/Closing date/)) as HTMLInputElement
    fireEvent.change(field, { target: { value: '2026-02-01' } })
    await portal.user.click(screen.getByRole('button', { name: 'Save Outcome' }))
    await waitFor(() => expect(field.value).toBe('2026-03-05'))
  })

  test('an answer of 422 is shown on the form', async () => {
    const portal = visit(`/sales-history/deals/${deal.id}`, 'owner', [
      route('GET', `${DEALS}/${deal.id}`, json(200, deal)),
      route('PUT', `${DEALS}/${deal.id}/outcome`, failure(422, 'request.invalid')),
    ])
    await portal.user.type(await screen.findByLabelText(/Closing date/), '2026-01-31')
    await portal.user.click(screen.getByRole('button', { name: 'Save Outcome' }))
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0)
  })
})

describe('the Rep picker shows what each speaker said', () => {
  const awaiting = {
    ...callBody(1, {
      kind: 'recording',
      mediaType: 'audio/wav',
      state: 'awaiting_rep',
      rep: null,
      inSearch: false,
      speakerLabels: ['A', 'B'],
    }),
  }
  const withSpeakers = {
    ...awaiting,
    speakers: [
      { label: 'A', excerpt: 'Hello, thanks for calling Northline.' },
      { label: 'B', excerpt: '<img src=x onerror=alert(1)> I need a quote.' },
    ],
  }
  const open = async (single: unknown) => {
    const portal = visit('/sales-history/calls', 'owner', [
      route('GET', RIGHTS, json(200, rightsBody())),
      route('GET', `${CALLS}/${awaiting.id}`, json(200, single)),
      route('GET', CALLS, json(200, page([awaiting]))),
    ])
    await portal.user.click(await screen.findByRole('button', { name: 'Change Rep of call-1.txt' }))
    return portal
  }

  test('lists each label with its excerpt, as text and never as markup', async () => {
    await open(withSpeakers)
    const list = await screen.findByRole('list', { name: 'What each speaker said' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]?.textContent).toContain('A')
    expect(items[0]?.textContent).toContain('Hello, thanks for calling Northline.')
    expect(items[1]?.textContent).toContain('<img src=x onerror=alert(1)> I need a quote.')
    expect(list.querySelector('img')).toBeNull()
  })

  test('the list does not ask for excerpts: they come from the single Call read', async () => {
    const portal = await open(withSpeakers)
    await screen.findByRole('list', { name: 'What each speaker said' })
    expect(
      portal.calls.some((call) => call.method === 'GET' && call.path === `${CALLS}/${awaiting.id}`)
    ).toBe(true)
  })

  test('with no speakers on the Call the picker is as before', async () => {
    const portal = await open(awaiting)
    const select = await screen.findByLabelText('Rep for call-1.txt')
    expect((await optionsOf(portal.user, select)).map((option) => option.text)).toEqual([
      'Choose a speaker',
      'A',
      'B',
    ])
    expect(screen.queryByRole('list', { name: 'What each speaker said' })).toBeNull()
  })

  test('when the single read fails the picker still works', async () => {
    const portal = visit('/sales-history/calls', 'owner', [
      route('GET', RIGHTS, json(200, rightsBody())),
      route('GET', `${CALLS}/${awaiting.id}`, failure(404, 'call.not_found')),
      route('GET', CALLS, json(200, page([awaiting]))),
    ])
    await portal.user.click(await screen.findByRole('button', { name: 'Change Rep of call-1.txt' }))
    expect(await screen.findByLabelText('Rep for call-1.txt')).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'What each speaker said' })).toBeNull()
  })
})
