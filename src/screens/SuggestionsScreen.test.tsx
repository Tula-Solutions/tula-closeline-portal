import { describe, expect, test } from 'bun:test'
import { screen, waitFor, within } from '@testing-library/react'
import { hexId } from '~/testing/core-bodies'
import { failure, json, route } from '~/testing/fixtures'
import { param, visit } from '~/testing/sales'
import { choose } from '~/testing/select'

const LIST = '/v1/playbook/suggestions'
const LEARNING = '/v1/playbook/settings/learning'
const RESOLVE = '/v1/playbook/citations/resolve'
const URL = '/playbook/suggestions'

const sgs = (n: number) => `sgs_${n.toString(16).padStart(32, '0')}`

const decided = (n: number, status: 'accepted' | 'rejected') =>
  suggestion(n, {
    status,
    decidedAt: '2026-10-13T09:00:00Z',
    decidedByMembershipId: hexId('mem', 1),
  })

const suggestion = (n: number, over: Record<string, unknown> = {}) => ({
  id: sgs(n),
  kind: 'objection_answer',
  status: 'pending',
  text: `Ask what the delay costs them (${n}).`,
  provenance: {
    dealRecordId: hexId('deal', n),
    moments: [
      { kind: 'moment', callId: hexId('call', n), dealRecordId: hexId('deal', n), momentIndex: 2 },
      { kind: 'moment', callId: hexId('call', n + 100), dealRecordId: hexId('deal', n) },
    ],
  },
  createdAt: '2026-10-12T09:00:00Z',
  decidedAt: null,
  decidedByMembershipId: null,
  ...over,
})
const page = (items: unknown[], nextCursor: string | null = null) =>
  json(200, { items, nextCursor })
const learning = (on = true) => route('GET', LEARNING, json(200, { learnFromAgentMoments: on }))
const resolved = () =>
  route('POST', RESOLVE, (call) =>
    json(200, {
      items: (call.body as { refs: { callId: string; dealRecordId: string }[] }).refs.map(
        (ref, index) =>
          index === 1
            ? { state: 'removed', kind: 'moment', ...ref }
            : {
                state: 'available',
                kind: 'moment',
                ...ref,
                prospect: 'We already use a competitor.',
                repNext: 'What would switching save you?',
              }
      ),
    })
  )
const open = (
  role: 'owner' | 'admin' | 'manager' | 'rep',
  ...extra: Parameters<typeof route>[2][]
) =>
  visit(URL, role, [learning(), ...extra.map((answer) => route('GET', LIST, answer)), resolved()])
const listWith = (items: unknown[]) => open('admin', page(items))
const entries = async () =>
  within(await screen.findByRole('list', { name: 'Suggestions' })).getAllByRole('listitem')

describe('Suggestions: who may see the tab', () => {
  test.each(['owner', 'admin'] as const)('an %s sees the tab and the list', async (role) => {
    const portal = open(role, page([suggestion(1)]))
    expect(await screen.findByRole('heading', { name: 'Suggestions' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Suggestions' })).toBeTruthy()
    await entries()
    expect(portal.calls.some((call) => call.path === LIST)).toBe(true)
  })

  test.each(['manager', 'rep'] as const)(
    'a %s has no tab, gets a notice and makes no request',
    async (role) => {
      const portal = open(role, page([suggestion(1)]))
      expect(await screen.findByText(/for Owners and Admins/)).toBeTruthy()
      expect(screen.queryByRole('link', { name: 'Suggestions' })).toBeNull()
      expect(portal.calls.filter((call) => call.path.startsWith('/v1/playbook/s'))).toHaveLength(0)
    }
  )
})

describe('Suggestions: the entry', () => {
  test('shows the text, the kind, the originating Deal and numbered citations', async () => {
    listWith([suggestion(1)])
    const [entry] = await entries()
    const row = within(entry as HTMLElement)
    expect(row.getByText('Ask what the delay costs them (1).')).toBeTruthy()
    expect(row.getByText('Objection answer')).toBeTruthy()
    const deal = row.getByRole('link', { name: /Deal/ })
    expect(deal.getAttribute('href')).toBe(`/sales-history/deals/${hexId('deal', 1)}`)
    expect(row.getByRole('button', { name: 'Open Moment 1' }).textContent).toBe('1')
    expect(row.getByRole('button', { name: 'Open Moment 2' }).textContent).toBe('2')
  })

  test('opening a citation resolves the Moments and shows their text', async () => {
    const portal = listWith([suggestion(1)])
    const [entry] = await entries()
    const row = within(entry as HTMLElement)
    await portal.user.click(row.getByRole('button', { name: 'Open Moment 1' }))
    expect(await row.findByText('We already use a competitor.')).toBeTruthy()
    expect(row.getByText('What would switching save you?')).toBeTruthy()
    expect(row.getByRole('button', { name: 'Open Moment 1' }).getAttribute('aria-expanded')).toBe(
      'true'
    )
    const resolve = portal.calls.filter((call) => call.path === RESOLVE)
    expect(resolve).toHaveLength(1)
    expect(resolve[0]?.body).toEqual({
      refs: [
        {
          kind: 'moment',
          callId: hexId('call', 1),
          dealRecordId: hexId('deal', 1),
          momentIndex: 2,
        },
        { kind: 'moment', callId: hexId('call', 101), dealRecordId: hexId('deal', 1) },
      ],
    })
    const calls = row.getByRole('link', { name: /Calls of this Deal/ })
    expect(calls.getAttribute('href')).toBe(`/sales-history/calls?deal=${hexId('deal', 1)}`)
  })

  test('a removed Moment says so instead of showing text', async () => {
    const portal = listWith([suggestion(1)])
    const [entry] = await entries()
    const row = within(entry as HTMLElement)
    await portal.user.click(row.getByRole('button', { name: 'Open Moment 2' }))
    expect(await row.findByText(/no longer available/)).toBeTruthy()
  })

  test('a citation that cannot be loaded shows an error', async () => {
    const portal = visit(URL, 'admin', [
      learning(),
      route('GET', LIST, page([suggestion(1)])),
      route('POST', RESOLVE, failure(503, 'server.unavailable')),
    ])
    const [entry] = await entries()
    const row = within(entry as HTMLElement)
    await portal.user.click(row.getByRole('button', { name: 'Open Moment 1' }))
    expect(await row.findByRole('alert')).toBeTruthy()
  })

  test('Suggestion text and Moment text with markup are shown literally', async () => {
    const evil = '<img src=x onerror=alert(1)> <b>bold</b>'
    const portal = visit(URL, 'admin', [
      learning(),
      route('GET', LIST, page([suggestion(1, { text: evil })])),
      route('POST', RESOLVE, (call) =>
        json(200, {
          items: (call.body as { refs: object[] }).refs.map((ref) => ({
            state: 'available',
            kind: 'moment',
            ...ref,
            prospect: '<script>x()</script>',
            repNext: '<i>next</i>',
          })),
        })
      ),
    ])
    const [entry] = await entries()
    const row = within(entry as HTMLElement)
    expect(row.getByText(evil)).toBeTruthy()
    await portal.user.click(row.getByRole('button', { name: 'Open Moment 1' }))
    expect(await row.findByText('<script>x()</script>')).toBeTruthy()
    expect(row.getByText('<i>next</i>')).toBeTruthy()
    expect(document.querySelector('main img, main b, main script, main i')).toBeNull()
  })
})

describe('Suggestions: deciding', () => {
  test('accept sends an empty body with an Idempotency-Key and refreshes the list', async () => {
    let state = 'pending'
    const portal = visit(URL, 'admin', [
      learning(),
      route('POST', `${LIST}/${sgs(1)}/accept`, (call) => {
        state = 'accepted'
        expect(call.body).toEqual({})
        return json(200, decided(1, 'accepted'))
      }),
      route('GET', LIST, () => page(state === 'pending' ? [suggestion(1)] : [])),
    ])
    const [entry] = await entries()
    await portal.user.click(within(entry as HTMLElement).getByRole('button', { name: 'Accept' }))
    expect(await screen.findByText(/Accepted/)).toBeTruthy()
    const accept = portal.calls.find((call) => call.path === `${LIST}/${sgs(1)}/accept`)
    expect(accept?.headers.get('Idempotency-Key')).toMatch(/^[A-Za-z0-9_.:-]{16,128}$/)
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Suggestions' })).toBeNull())
  })

  test('edit then accept sends the edited text', async () => {
    const portal = visit(URL, 'admin', [
      learning(),
      route('GET', LIST, page([suggestion(1)])),
      route('POST', `${LIST}/${sgs(1)}/accept`, json(200, decided(1, 'accepted'))),
    ])
    const [entry] = await entries()
    const row = within(entry as HTMLElement)
    await portal.user.click(row.getByRole('button', { name: 'Edit' }))
    const box = row.getByRole('textbox', { name: 'Suggestion text' })
    expect((box as HTMLTextAreaElement).value).toBe('Ask what the delay costs them (1).')
    await portal.user.clear(box)
    await portal.user.type(box, 'Ask what waiting costs.')
    await portal.user.click(row.getByRole('button', { name: 'Accept edited text' }))
    await waitFor(() =>
      expect(portal.calls.find((call) => call.path.endsWith('/accept'))?.body).toEqual({
        text: 'Ask what waiting costs.',
      })
    )
  })

  test('edit can be cancelled and an empty text is not sent', async () => {
    const portal = listWith([suggestion(1)])
    const [entry] = await entries()
    const row = within(entry as HTMLElement)
    await portal.user.click(row.getByRole('button', { name: 'Edit' }))
    await portal.user.clear(row.getByRole('textbox', { name: 'Suggestion text' }))
    await portal.user.click(row.getByRole('button', { name: 'Accept edited text' }))
    expect(await row.findByText(/Write the text/)).toBeTruthy()
    expect(portal.calls.some((call) => call.path.endsWith('/accept'))).toBe(false)
    await portal.user.click(row.getByRole('button', { name: 'Cancel' }))
    expect(row.queryByRole('textbox')).toBeNull()
  })

  test('reject posts to the reject route and refreshes', async () => {
    let state = 'pending'
    const portal = visit(URL, 'admin', [
      learning(),
      route('POST', `${LIST}/${sgs(1)}/reject`, () => {
        state = 'rejected'
        return json(200, decided(1, 'rejected'))
      }),
      route('GET', LIST, () => page(state === 'pending' ? [suggestion(1)] : [])),
    ])
    const [entry] = await entries()
    await portal.user.click(within(entry as HTMLElement).getByRole('button', { name: 'Reject' }))
    expect(await screen.findByText(/Rejected/)).toBeTruthy()
    const reject = portal.calls.find((call) => call.path.endsWith('/reject'))
    expect(reject?.body).toEqual({})
    expect(reject?.headers.get('Idempotency-Key')).toBeTruthy()
  })

  test('a second decision (409 suggestion.not_pending) says already decided and refreshes', async () => {
    let lists = 0
    const portal = visit(URL, 'admin', [
      learning(),
      route('POST', `${LIST}/${sgs(1)}/accept`, failure(409, 'suggestion.not_pending')),
      route('GET', LIST, () => {
        lists += 1
        return page(lists === 1 ? [suggestion(1)] : [])
      }),
    ])
    const [entry] = await entries()
    await portal.user.click(within(entry as HTMLElement).getByRole('button', { name: 'Accept' }))
    expect(await screen.findByText(/already decided/i)).toBeTruthy()
    await waitFor(() => expect(lists).toBe(2))
  })

  test('another failure is worded from its code and the entry stays', async () => {
    const portal = visit(URL, 'admin', [
      learning(),
      route('GET', LIST, page([suggestion(1)])),
      route('POST', `${LIST}/${sgs(1)}/reject`, failure(503, 'server.unavailable')),
    ])
    const [entry] = await entries()
    const row = within(entry as HTMLElement)
    await portal.user.click(row.getByRole('button', { name: 'Reject' }))
    expect(await row.findByRole('alert')).toBeTruthy()
    expect(row.getByRole('button', { name: 'Reject' })).toBeTruthy()
  })
})

describe('Suggestions: the status filter', () => {
  test('lists pending first and can show decided ones', async () => {
    const portal = open('admin', page([suggestion(1)]))
    await entries()
    expect(param(portal.calls.find((call) => call.path === LIST)?.url ?? '', 'status')).toBe(
      'pending'
    )
    await choose(portal.user, screen.getByRole('combobox', { name: 'Show' }), 'accepted')
    await waitFor(() =>
      expect(
        portal.calls.some((call) => call.path === LIST && param(call.url, 'status') === 'accepted')
      ).toBe(true)
    )
  })

  test('a decided Suggestion has no actions', async () => {
    const portal = visit(URL, 'admin', [
      learning(),
      route('GET', LIST, page([decided(1, 'accepted')])),
    ])
    await choose(portal.user, await screen.findByRole('combobox', { name: 'Show' }), 'accepted')
    const [entry] = await entries()
    expect(within(entry as HTMLElement).queryByRole('button', { name: 'Accept' })).toBeNull()
    expect(within(entry as HTMLElement).getByText(/Accepted/)).toBeTruthy()
  })
})

describe('Suggestions: loading, empty and error', () => {
  test('shows a loading message while the list is on its way', async () => {
    visit(URL, 'admin', [learning(), route('GET', LIST, () => new Promise<Response>(() => {}))])
    expect(await screen.findByText('Loading Suggestions...')).toBeTruthy()
  })

  test('says what an empty list means', async () => {
    open('admin', page([]))
    expect(await screen.findByText('Nothing to review')).toBeTruthy()
    expect(document.querySelector('[data-slot="empty-state"] svg')).toBeNull()
  })

  test('shows an error in words and tries again', async () => {
    let broken = true
    const portal = visit(URL, 'admin', [
      learning(),
      route('GET', LIST, () =>
        broken ? failure(503, 'server.unavailable') : page([suggestion(1)])
      ),
    ])
    expect(await screen.findByRole('alert', {}, { timeout: 8000 })).toBeTruthy()
    broken = false
    await portal.user.click(screen.getByRole('button', { name: /Try again/ }))
    await entries()
  })
})

describe('Suggestions: the learning switch', () => {
  test('reads the setting and explains what it does', async () => {
    open('admin', page([]))
    const box = await screen.findByRole('switch', { name: /Learn from Agent Moments/ })
    expect((box as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText(/removes nothing already learned/i)).toBeTruthy()
    expect(screen.getByText(/Nothing reaches an Agent until you accept it/)).toBeTruthy()
  })

  test('turning it off sends the new value with PUT', async () => {
    let stored = true
    const portal = visit(URL, 'admin', [
      route('GET', LEARNING, () => json(200, { learnFromAgentMoments: stored })),
      route('PUT', LEARNING, (call) => {
        stored = (call.body as { learnFromAgentMoments: boolean }).learnFromAgentMoments
        return json(200, { learnFromAgentMoments: stored })
      }),
      route('GET', LIST, page([])),
    ])
    const box = await screen.findByRole('switch', { name: /Learn from Agent Moments/ })
    await portal.user.click(box)
    await waitFor(() =>
      expect(portal.calls.find((call) => call.method === 'PUT')?.body).toEqual({
        learnFromAgentMoments: false,
      })
    )
    await waitFor(() => expect((box as HTMLInputElement).checked).toBe(false))
  })

  test('a failed change leaves the switch as it was and says so', async () => {
    const portal = visit(URL, 'admin', [
      learning(true),
      route('PUT', LEARNING, failure(503, 'server.unavailable')),
      route('GET', LIST, page([])),
    ])
    const box = await screen.findByRole('switch', { name: /Learn from Agent Moments/ })
    await portal.user.click(box)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect((box as HTMLInputElement).checked).toBe(true)
  })

  test('if the setting cannot be read, the list still works and the switch says so', async () => {
    visit(URL, 'admin', [
      route('GET', LEARNING, failure(500, 'server.internal')),
      route('GET', LIST, page([suggestion(1)])),
    ])
    await entries()
    expect(await screen.findByText(/could not read this setting/i)).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
  })
})
