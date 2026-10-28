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
