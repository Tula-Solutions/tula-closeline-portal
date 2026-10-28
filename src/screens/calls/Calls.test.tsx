import { describe, expect, test } from 'bun:test'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { ERRORS, VOICE_ERRORS } from 'tula-closeline-contract'
import { hexId, memberBody, page } from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'
import { param } from '~/testing/sales'
import { choose } from '~/testing/select'

const CALLS = '/v1/calls'
const one = (n: number) => `${CALLS}/${hexId('call', n)}`

type Overrides = Partial<{
  direction: 'inbound' | 'outbound'
  state: string
  endedAt: string | null
  dealId: string | null
  note: string | null
  recordingState: 'none' | 'storing' | 'stored' | 'deleted'
  transcriptState: 'pending' | 'ready' | 'deleted'
  prospectNumber: string
  endedBy: string | null
  durationSeconds: number | null
}>

function callBody(n: number, overrides: Overrides = {}) {
  return {
    id: hexId('call', n),
    direction: 'inbound',
    state: 'ended',
    lineId: hexId('line', 1),
    repMembershipId: hexId('mem', 1),
    prospectId: null,
    prospectNumber: `+1415555${String(n).padStart(4, '0')}`,
    disclosure: { wordingVersion: 1, playedAt: '2026-10-01T10:00:00Z', aiAssisted: false },
    createdAt: '2026-10-01T10:00:00Z',
    answeredAt: '2026-10-01T10:00:05Z',
    endedAt: '2026-10-01T10:03:12Z',
    durationSeconds: 187,
    endedBy: 'prospect',
    failureReason: null,
    dealId: null,
    note: null,
    recordingState: 'stored',
    transcriptState: 'ready',
    ...overrides,
  }
}

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', url: string, ...handlers: Handler[]) {
  return renderPortal({
    url,
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers,
  })
}

const members = route('GET', '/v1/members', json(200, page([memberBody(1, { name: 'Maya Chen' })])))

describe('Call history: the list', () => {
  const list = route('GET', CALLS, json(200, page([callBody(1), callBody(2)])))

  test('a Rep sees the Calls with no Rep filter and no member lookups', async () => {
    const portal = visit('rep', '/calls', list, members)
    expect(await screen.findByRole('link', { name: '+14155550001' })).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: 'Rep' })).toBeNull()
    expect(portal.calls.some((call) => call.path === '/v1/members')).toBe(false)
    const first = portal.calls.find((call) => call.path === CALLS)
    expect(param(first?.url ?? '', 'repMembershipId')).toBeNull()
  })

  test('a Manager and an Admin can filter by Rep and see Rep names', async () => {
    visit('manager', '/calls', list, members)
    expect(await screen.findByRole('combobox', { name: 'Rep' })).toBeTruthy()
    expect((await screen.findAllByText('Maya Chen')).length).toBe(2)
  })

  test('pages by cursor', async () => {
    const portal = visit(
      'admin',
      '/calls',
      route('GET', CALLS, (call) =>
        param(call.url, 'cursor') === 'c2'
          ? json(200, page([callBody(3)]))
          : json(200, page([callBody(1)], 'c2'))
      ),
      members
    )
    await screen.findByRole('link', { name: '+14155550001' })
    await portal.user.click(screen.getByRole('button', { name: 'Load more Calls' }))
    expect(await screen.findByRole('link', { name: '+14155550003' })).toBeTruthy()
    expect(portal.calls.filter((call) => call.path === CALLS)[1]?.url).toContain('cursor=c2')
  })

  test('the filters go to the service as query parameters', async () => {
    const portal = visit('rep', '/calls', list)
    await screen.findByRole('link', { name: '+14155550001' })
    await choose(portal.user, screen.getByRole('combobox', { name: 'Direction' }), 'outbound')
    await choose(portal.user, screen.getByRole('combobox', { name: 'State' }), 'missed')
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } })
    await waitFor(() => {
      const last = portal.calls.filter((call) => call.path === CALLS).at(-1)
      expect(param(last?.url ?? '', 'direction')).toBe('outbound')
      expect(param(last?.url ?? '', 'state')).toBe('missed')
      expect(Date.parse(param(last?.url ?? '', 'from') ?? '')).not.toBeNaN()
    })
  })

  test('says so when there are no Calls', async () => {
    visit('rep', '/calls', route('GET', CALLS, json(200, page([]))))
    expect(await screen.findByText('No Calls match.')).toBeTruthy()
  })
})

describe('Call detail: the Transcript', () => {
  const turns = (state: 'pending' | 'ready' | 'deleted', items: unknown[] = []) =>
    route(
      'GET',
      `${one(1)}/transcript`,
      json(200, { callId: hexId('call', 1), state, items, nextCursor: null })
    )

  test('shows the turns by speaker, text as plain text', async () => {
    visit(
      'rep',
      `/calls/${hexId('call', 1)}`,
      route('GET', one(1), json(200, callBody(1))),
      turns('ready', [
        { speaker: 'rep', startMs: 0, endMs: 2000, text: 'Hello <b>there</b>' },
        { speaker: 'prospect', startMs: 65000, endMs: 66000, text: 'Hi' },
      ])
    )
    expect(await screen.findByText('Hello <b>there</b>')).toBeTruthy()
    expect(screen.getByText(/Prospect · 1:05/)).toBeTruthy()
  })

  test.each([
    ['pending', 'The Transcript is not ready yet.'],
    ['deleted', 'The Transcript was deleted with the Recording.'],
  ] as const)('a %s Transcript is not requested', async (state, words) => {
    const portal = visit(
      'rep',
      `/calls/${hexId('call', 1)}`,
      route('GET', one(1), json(200, callBody(1, { transcriptState: state }))),
      turns(state)
    )
    expect(await screen.findByText(words)).toBeTruthy()
    expect(portal.calls.some((call) => call.path.endsWith('/transcript'))).toBe(false)
  })

  test('a Call outside the view is worded, not shown', async () => {
    visit('rep', `/calls/${hexId('call', 1)}`, route('GET', one(1), failure(404, 'call.not_found')))
    expect(await screen.findByText(/not available to you/)).toBeTruthy()
  })
})

describe('Call detail: wrap-up', () => {
  const at = `/calls/${hexId('call', 1)}`

  test('a Rep saves the Deal identifier and note; empty clears with null', async () => {
    const portal = visit(
      'rep',
      at,
      route('GET', one(1), json(200, callBody(1, { dealId: 'D-1' }))),
      route('PUT', `${one(1)}/wrap-up`, (call) => json(200, callBody(1, call.body as Overrides))),
      route('GET', `${one(1)}/transcript`, json(200, page([])))
    )
    const deal = await screen.findByLabelText('Deal identifier')
    expect((deal as HTMLInputElement).value).toBe('D-1')
    await portal.user.clear(deal)
    await portal.user.type(screen.getByLabelText('Note'), 'Send the quote')
    await portal.user.click(screen.getByRole('button', { name: 'Save wrap-up' }))
    await waitFor(() =>
      expect(screen.getAllByRole('status').some((s) => s.textContent === 'Wrap-up saved.')).toBe(
        true
      )
    )
    expect(portal.calls.find((call) => call.method === 'PUT')?.body).toEqual({
      dealId: null,
      note: 'Send the quote',
    })
  })

  test('a Manager reads the wrap-up and has no form', async () => {
    visit(
      'manager',
      at,
      route('GET', one(1), json(200, callBody(1, { dealId: 'D-9' }))),
      route('GET', `${one(1)}/transcript`, json(200, page([])))
    )
    expect(await screen.findByText('D-9')).toBeTruthy()
    expect(screen.queryByLabelText('Deal identifier')).toBeNull()
  })

  test('a Call still running cannot be wrapped up', async () => {
    visit(
      'rep',
      at,
      route(
        'GET',
        one(1),
        json(
          200,
          callBody(1, {
            state: 'live',
            endedAt: null,
            endedBy: null,
            durationSeconds: null,
            recordingState: 'none',
            transcriptState: 'pending',
          })
        )
      )
    )
    expect(await screen.findByText(/once it has ended/)).toBeTruthy()
    expect(screen.queryByLabelText('Note')).toBeNull()
  })

  test('call.not_ended from the service is worded', async () => {
    const portal = visit(
      'rep',
      at,
      route('GET', one(1), json(200, callBody(1))),
      route('PUT', `${one(1)}/wrap-up`, failure(409, VOICE_ERRORS['call.not_ended'].code)),
      route('GET', `${one(1)}/transcript`, json(200, page([])))
    )
    await portal.user.type(await screen.findByLabelText('Note'), 'x')
    await portal.user.click(screen.getByRole('button', { name: 'Save wrap-up' }))
    expect(await screen.findByText(/has not ended yet/)).toBeTruthy()
  })

  test('a note over 2000 characters is refused before sending', async () => {
    const portal = visit(
      'rep',
      at,
      route('GET', one(1), json(200, callBody(1))),
      route('GET', `${one(1)}/transcript`, json(200, page([])))
    )
    fireEvent.change(await screen.findByLabelText('Note'), { target: { value: 'x'.repeat(2001) } })
    await portal.user.click(screen.getByRole('button', { name: 'Save wrap-up' }))
    expect(await screen.findByText(/2000 characters or fewer/)).toBeTruthy()
    expect(portal.calls.some((call) => call.method === 'PUT')).toBe(false)
  })
})

describe('Call detail: the Recording', () => {
  const at = `/calls/${hexId('call', 1)}`
  const base = (role: 'rep' | 'admin', overrides: Overrides = {}, ...more: Handler[]) =>
    visit(
      role,
      at,
      route('GET', one(1), json(200, callBody(1, overrides))),
      route('GET', `${one(1)}/transcript`, json(200, page([]))),
      ...more
    )
  const playback = (expiresAt: string) =>
    route(
      'GET',
      `${one(1)}/recording`,
      json(200, {
        callId: hexId('call', 1),
        url: 'https://storage.example/rec.mp3?sig=abc',
        expiresAt,
        mediaType: 'audio/mpeg',
        channels: 2,
        durationSeconds: 187,
      })
    )

  test('only an Admin or Owner is offered Delete Recording', async () => {
    base('rep')
    await screen.findByRole('button', { name: 'Play Recording' })
    expect(screen.queryByRole('button', { name: 'Delete Recording' })).toBeNull()
  })

  test('plays from the signed URL and stops when it expires', async () => {
    const portal = base('rep', {}, playback(new Date(Date.now() + 150).toISOString()))
    await portal.user.click(await screen.findByRole('button', { name: 'Play Recording' }))
    const audio = await screen.findByLabelText('Recording audio')
    expect(audio.getAttribute('src')).toBe('https://storage.example/rec.mp3?sig=abc')
    expect(await screen.findByText('Playback link expired. Play again.')).toBeTruthy()
    expect(screen.queryByLabelText('Recording audio')).toBeNull()
    expect(screen.getByRole('button', { name: 'Play again' })).toBeTruthy()
  })

  test('recording.not_ready is worded', async () => {
    const portal = base(
      'rep',
      {},
      route('GET', `${one(1)}/recording`, failure(409, VOICE_ERRORS['recording.not_ready'].code))
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Play Recording' }))
    expect(await screen.findByText(/still being stored/)).toBeTruthy()
  })

  test('an Admin deletes the Recording after confirming', async () => {
    const portal = base(
      'admin',
      {},
      route(
        'DELETE',
        `${one(1)}/recording`,
        json(200, callBody(1, { recordingState: 'deleted', transcriptState: 'deleted' }))
      )
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Delete Recording' }))
    expect(portal.calls.some((call) => call.method === 'DELETE')).toBe(false)
    await portal.user.click(
      screen.getAllByRole('button', { name: 'Delete Recording' }).at(-1) as HTMLElement
    )
    expect(await screen.findByText('The Recording was deleted.')).toBeTruthy()
    expect(portal.calls.filter((call) => call.method === 'DELETE')).toHaveLength(1)
  })

  test('a forbidden delete is worded', async () => {
    const portal = base(
      'admin',
      {},
      route('DELETE', `${one(1)}/recording`, failure(403, ERRORS['auth.forbidden'].code))
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Delete Recording' }))
    await portal.user.click(
      screen.getAllByRole('button', { name: /Delete Recording/ }).at(-1) as HTMLElement
    )
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0)
  })
})
