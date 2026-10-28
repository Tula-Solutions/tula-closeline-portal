import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type CopilotStreamMessage, formatCopilotStreamFrame } from 'tula-closeline-contract'
import { createApp } from '~/app'
import { AppContext } from '~/app-context'
import { createReporter } from '~/report/reporter'
import { Softphone } from '~/screens/softphone/Softphone'
import {
  type Call,
  failure,
  fakeFetch,
  type Handler,
  json,
  route,
  TEST_ENV,
  tokens,
} from '~/testing/fixtures'

const ID = `call_${'a'.repeat(32)}`
const CALL = {
  id: ID,
  direction: 'outbound',
  state: 'live',
  prospectNumber: '+15550100',
  disclosure: { wordingVersion: 3, playedAt: '2026-10-28T10:00:00Z', aiAssisted: true },
}

const status = (state: 'waiting_for_disclosure' | 'live' | 'ended', id: string) =>
  ({
    id,
    event: 'copilot.status',
    data: { callId: ID, state, quietReason: null },
  }) as CopilotStreamMessage
const turn = (n: number, speaker: 'rep' | 'prospect', text: string) =>
  ({
    id: `t${n}`,
    event: 'transcript.turn',
    data: {
      callId: ID,
      sequence: n,
      turn: { speaker, startMs: n * 1000, endMs: n * 1000 + 900, text },
    },
  }) as CopilotStreamMessage

/** A stream answer: the frames as the server writes them, then the end of the stream. */
function sse(...messages: CopilotStreamMessage[]) {
  return new Response(messages.map((m) => formatCopilotStreamFrame(m)).join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

const original = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
beforeEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: async () => ({ getTracks: () => [{ stop() {} }], getAudioTracks: () => [] }),
    },
  })
})
afterEach(() => {
  cleanup()
  if (original) {
    Object.defineProperty(navigator, 'mediaDevices', original)
  }
})

function mount(...handlers: Handler[]) {
  const double = fakeFetch(
    route('POST', '/v1/calls', json(201, { call: CALL })),
    route('GET', `/v1/calls/${ID}`, json(200, CALL)),
    route('GET', '/v1/calls', json(200, { items: [] })),
    ...handlers
  )
  const app = createApp({
    env: TEST_ENV,
    reporter: createReporter(
      () => {},
      () => {}
    ),
    fetch: double.fetch,
    sleep: () => new Promise((done) => setTimeout(done, 5)),
    random: () => 0,
  })
  app.session.start(tokens())
  render(
    <AppContext.Provider value={app}>
      <QueryClientProvider client={app.queryClient}>
        <Softphone pollMs={5} />
      </QueryClientProvider>
    </AppContext.Provider>
  )
  return { calls: double.calls, user: userEvent.setup() }
}

async function dial(user: ReturnType<typeof userEvent.setup>, copilot = true) {
  await user.click(screen.getByRole('button', { name: 'Open' }))
  await user.type(screen.getByLabelText('Number to call'), '+15550100')
  if (!copilot) {
    await user.click(screen.getByLabelText('Copilot for this Call'))
  }
  await user.click(screen.getByRole('button', { name: 'Call' }))
}

const streams = (calls: Call[]) => calls.filter((c) => c.path === `/v1/calls/${ID}/copilot/stream`)

describe('Live Transcript', () => {
  test('a scripted conversation shows in order, labelled by speaker, and the stream ends with the Call', async () => {
    const { user, calls } = mount(
      route(
        'GET',
        `/v1/calls/${ID}/copilot/stream`,
        sse(
          status('live', 's1'),
          turn(1, 'rep', 'Hi, this is Sam.'),
          turn(2, 'prospect', 'Hello <b>Sam</b>'),
          status('ended', 's2')
        )
      )
    )
    await dial(user)
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ copilot: true })
    const log = await screen.findByRole('log', { name: 'Transcript turns' })
    await waitFor(() => expect(within(log).getAllByRole('listitem')).toHaveLength(2))
    const items = within(log).getAllByRole('listitem')
    expect(items[0]?.textContent).toBe('YouHi, this is Sam.')
    // Spoken words are text, never markup.
    expect(items[1]?.textContent).toBe('ProspectHello <b>Sam</b>')
    expect(log.querySelector('b')).toBeNull()
    await screen.findByText('The Call is over. This is what was said.')
    expect(streams(calls)).toHaveLength(1)
  })

  test('says it is waiting for the Disclosure before the first turn', async () => {
    const { user } = mount(
      route('GET', `/v1/calls/${ID}/copilot/stream`, sse(status('waiting_for_disclosure', 's1')))
    )
    await dial(user)
    await screen.findByText(/Waiting for the Disclosure\. The Transcript starts/)
  })

  test('reconnects after a dropped stream from the last event, with no turn twice', async () => {
    let opened = 0
    const { user, calls } = mount(
      route('GET', `/v1/calls/${ID}/copilot/stream`, () => {
        opened += 1
        return opened === 1
          ? sse(status('live', 's1'), turn(1, 'rep', 'First'))
          : sse(turn(1, 'rep', 'First'), turn(2, 'prospect', 'Second'), status('ended', 's2'))
      })
    )
    await dial(user)
    await screen.findByText('Second')
    expect(screen.getAllByText('First')).toHaveLength(1)
    const open = streams(calls)
    expect(open[0]?.headers.get('last-event-id')).toBeNull()
    expect(open[1]?.headers.get('last-event-id')).toBe('t1')
  })

  test('a stream that closes at once with nothing in it is given up after a few tries', async () => {
    const { user, calls } = mount(route('GET', `/v1/calls/${ID}/copilot/stream`, sse()))
    await dial(user)
    await screen.findByText(/connection was lost/i)
    expect(streams(calls).length).toBeLessThanOrEqual(6)
  })

  test('a failing speech-to-text leaves the Call and says the Transcript is unavailable', async () => {
    const { user } = mount(
      route(
        'GET',
        `/v1/calls/${ID}/copilot/stream`,
        sse(
          status('live', 's1'),
          {
            id: 'u1',
            event: 'transcript.unavailable',
            data: { callId: ID, reason: 'speech_to_text_failed' },
          } as CopilotStreamMessage,
          status('ended', 's2')
        )
      )
    )
    await dial(user)
    await screen.findByText('Transcript unavailable. The Call is not affected.')
    // The Call itself is still shown live.
    expect(screen.getByLabelText('Softphone').textContent).toContain('Live')
  })

  test('with the Copilot off the Call is placed recorded-only and no stream opens', async () => {
    const { user, calls } = mount()
    await dial(user, false)
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ copilot: false })
    expect(screen.queryByLabelText('Live Transcript')).toBeNull()
    expect(streams(calls)).toHaveLength(0)
    expect(screen.getByText(/recorded only/)).toBeTruthy()
  })

  test('a Call the Copilot is off for says so and stops asking', async () => {
    const { user, calls } = mount(
      route('GET', `/v1/calls/${ID}/copilot/stream`, failure(409, 'copilot.disabled'))
    )
    await dial(user)
    await screen.findByText('The Copilot is off for this Call.')
    expect(streams(calls)).toHaveLength(1)
  })
})

const SOURCE = `call_${'9'.repeat(32)}`
const card = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `ccard_${String(n).repeat(32)}`,
  callId: ID,
  sequence: n,
  evidence: { moments: 4, deals: 3 },
  citedMoments: [{ callId: SOURCE, dealRecordId: `deal_${'1'.repeat(32)}` }],
  quotes: [
    {
      callId: SOURCE,
      dealRecordId: `deal_${'1'.repeat(32)}`,
      prospect: `Too dear <i>${n}</i>`,
      repNext: 'We showed the ROI',
    },
  ],
  shownAt: '2026-10-28T10:01:00Z',
  rating: null,
  dismissed: false,
  pinned: false,
  kind: 'similar_moment',
  ...extra,
})
const shownCard = (id: string, n: number, extra: Record<string, unknown> = {}) =>
  ({ id, event: 'copilot.card', data: { card: card(n, extra) } }) as CopilotStreamMessage
const PATCH = (n: number) => `/v1/calls/${ID}/copilot/cards/ccard_${String(n).repeat(32)}`

describe('Copilot cards in the Softphone', () => {
  test('a card shows its quote, what the Rep said next, evidence and a source Call link as text', async () => {
    const { user } = mount(
      route('GET', `/v1/calls/${ID}/copilot/stream`, sse(status('live', 's1'), shownCard('c1', 1)))
    )
    await dial(user)
    const panel = await screen.findByRole('region', { name: 'Copilot cards' })
    await within(panel).findByText(/Too dear/)
    expect(panel.textContent).toContain('Too dear <i>1</i>')
    expect(panel.querySelector('i')).toBeNull()
    expect(panel.textContent).toContain('We showed the ROI')
    expect(panel.textContent).toContain('based on 4 Moments from 3 Deals')
    expect(within(panel).getByRole('link', { name: 'Source Call' }).getAttribute('href')).toBe(
      `/calls/${SOURCE}`
    )
  })

  test('a rating goes out as a PATCH and a repeat of the same press sends the same end state', async () => {
    const { user, calls } = mount(
      route('GET', `/v1/calls/${ID}/copilot/stream`, sse(status('live', 's1'), shownCard('c1', 1))),
      route('PATCH', PATCH(1), json(200, card(1, { rating: 'useful' })))
    )
    await dial(user)
    const useful = await screen.findByRole('button', { name: 'Useful' })
    await user.click(useful)
    await waitFor(() => expect(useful.getAttribute('aria-pressed')).toBe('true'))
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ rating: 'useful' })
  })

  test('dismissing sends dismissed and takes the card off the panel', async () => {
    const { user, calls } = mount(
      route('GET', `/v1/calls/${ID}/copilot/stream`, sse(status('live', 's1'), shownCard('c1', 1))),
      route('PATCH', PATCH(1), json(200, card(1, { dismissed: true })))
    )
    await dial(user)
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }))
    await screen.findByText('Every card was dismissed.')
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ dismissed: true })
  })

  test('a refused mark is put back and shows the words for its code', async () => {
    const { user } = mount(
      route('GET', `/v1/calls/${ID}/copilot/stream`, sse(status('live', 's1'), shownCard('c1', 1))),
      route('PATCH', PATCH(1), failure(404, 'card.not_found'))
    )
    await dial(user)
    await user.click(await screen.findByRole('button', { name: 'Pin' }))
    await screen.findByText('That card is no longer available. Reload the cards.')
    expect(screen.getByRole('button', { name: 'Pin' }).getAttribute('aria-pressed')).toBe('false')
  })

  test('a pinned card stays on top when a newer card arrives', async () => {
    const { user } = mount(
      route(
        'GET',
        `/v1/calls/${ID}/copilot/stream`,
        sse(
          status('live', 's1'),
          shownCard('c1', 1, { pinned: true }),
          shownCard('c2', 2),
          shownCard('c3', 3)
        )
      )
    )
    await dial(user)
    const panel = await screen.findByRole('region', { name: 'Copilot cards' })
    await waitFor(() => expect(within(panel).getAllByRole('listitem')).toHaveLength(3))
    const rows = within(panel).getAllByRole('listitem')
    expect(rows[0]?.textContent).toContain('Too dear <i>1</i>')
    expect(rows[1]?.textContent).toContain('Too dear <i>3</i>')
  })

  test('card_updated changes a card in place and a replayed card is not shown twice', async () => {
    const { user } = mount(
      route(
        'GET',
        `/v1/calls/${ID}/copilot/stream`,
        sse(status('live', 's1'), shownCard('c1', 1), shownCard('c1b', 1), {
          id: 'c1c',
          event: 'copilot.card_updated',
          data: { card: card(1, { rating: 'useful' }) },
        } as CopilotStreamMessage)
      )
    )
    await dial(user)
    const useful = await screen.findByRole('button', { name: 'Useful' })
    await waitFor(() => expect(useful.getAttribute('aria-pressed')).toBe('true'))
    expect(screen.getAllByRole('button', { name: 'Useful' })).toHaveLength(1)
  })

  const quiet = (reason: 'not_enough_won_moments' | 'playbook_unavailable') =>
    ({
      id: 'q1',
      event: 'copilot.status',
      data: { callId: ID, state: 'live', quietReason: reason },
    }) as CopilotStreamMessage

  test.each([
    ['not_enough_won_moments', /does not have enough won Moments/],
    ['playbook_unavailable', /Playbook could not be reached/],
  ] as const)('an empty panel says why: %s', async (reason, words) => {
    const { user } = mount(route('GET', `/v1/calls/${ID}/copilot/stream`, sse(quiet(reason))))
    await dial(user)
    const panel = await screen.findByRole('region', { name: 'Copilot cards' })
    await within(panel).findByText(words)
  })

  test('with the Copilot off the panel says so', async () => {
    const { user } = mount(
      route('GET', `/v1/calls/${ID}/copilot/stream`, failure(409, 'copilot.disabled'))
    )
    await dial(user)
    const panel = await screen.findByRole('region', { name: 'Copilot cards' })
    await within(panel).findByText(/Copilot is off for this Call/)
  })

  test('with no reason from the service the panel does not invent one', async () => {
    const { user } = mount(
      route('GET', `/v1/calls/${ID}/copilot/stream`, sse(status('live', 's1')))
    )
    await dial(user)
    const panel = await screen.findByRole('region', { name: 'Copilot cards' })
    await within(panel).findByText(/No cards yet/)
  })
})
