import { afterEach, describe, expect, test } from 'bun:test'
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AGENT_ERRORS } from 'tula-closeline-contract'
import { createApp } from '~/app'
import { AppContext } from '~/app-context'
import { createReporter } from '~/report/reporter'
import { HandoffCard } from '~/screens/handoff/HandoffCard'
import { hexId, prospectBody } from '~/testing/core-bodies'
import { failure, fakeFetch, type Handler, json, route, TEST_ENV, tokens } from '~/testing/fixtures'

afterEach(cleanup)

const ID = `hof_${'a'.repeat(32)}`
const QST = (n: number) => `qst_${String(n).repeat(32)}`
const handoff = (state = 'pending') => ({
  id: ID,
  state,
  channel: 'call',
  callId: hexId('call', 1),
  chatId: null,
  repMembershipId: hexId('mem', 1),
  attempt: 1,
  reason: 'asked_for_rep',
  requestedAt: '2026-10-28T10:00:00Z',
  answeredAt: null,
  completedAt: null,
})
const context = {
  handoffId: ID,
  prospectId: hexId('prs', 1),
  qualification: {
    answers: [
      { questionId: QST(1), value: '50 seats', skipped: false },
      { questionId: QST(2), value: null, skipped: true },
    ],
    summary: 'Wants pricing for 50 seats.',
  },
  recentTurns: [
    {
      index: 0,
      role: 'agent',
      text: 'Hi, how can I help?',
      sources: [],
      deferred: false,
      toolCall: null,
      at: '2026-10-28T10:00:01Z',
    },
    {
      index: 1,
      role: 'prospect',
      text: 'I want a person.',
      sources: [],
      deferred: false,
      toolCall: null,
      at: '2026-10-28T10:00:05Z',
    },
  ],
}

function mount(...handlers: Handler[]) {
  const double = fakeFetch(
    ...handlers,
    route('GET', '/v1/handoffs', json(200, { items: [handoff()], nextCursor: null })),
    route('GET', `/v1/handoffs/${ID}`, json(200, context)),
    route('GET', `/v1/prospects/${hexId('prs', 1)}`, json(200, prospectBody(1)))
  )
  const app = createApp({
    env: TEST_ENV,
    reporter: createReporter(
      () => {},
      () => {}
    ),
    fetch: double.fetch,
    sleep: async () => {},
    random: () => 0,
  })
  app.session.start(tokens())
  render(
    <AppContext.Provider value={app}>
      <QueryClientProvider client={app.queryClient}>
        <HandoffCard pollMs={5} />
      </QueryClientProvider>
    </AppContext.Provider>
  )
  return { calls: double.calls, user: userEvent.setup() }
}

describe('HandoffCard', () => {
  test('shows nothing while no Handoff is offered', async () => {
    mount(route('GET', '/v1/handoffs', json(200, { items: [], nextCursor: null })))
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByLabelText('Incoming Handoff')).toBeNull()
  })

  test('an offered Handoff shows its context and accept bridges', async () => {
    const { user, calls } = mount(
      route('POST', `/v1/handoffs/${ID}/accept`, json(200, handoff('accepted')))
    )
    expect(await screen.findByText('I want a person.')).toBeTruthy()
    expect(screen.getByText('Wants pricing for 50 seats.')).toBeTruthy()
    expect(screen.getByText('1 of 2 questions answered')).toBeTruthy()
    expect(await screen.findByText('First1 Last1')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Accept' }))
    await screen.findByText(/Accepted\. The Disclosure plays/)
    expect(calls.some((c) => c.method === 'POST' && c.path === `/v1/handoffs/${ID}/accept`)).toBe(
      true
    )
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull()
  })

  test('decline sends the decline and closes the offer', async () => {
    const { user, calls } = mount(
      route('POST', `/v1/handoffs/${ID}/decline`, json(200, handoff('declined')))
    )
    await user.click(await screen.findByRole('button', { name: 'Decline' }))
    await screen.findByText(/Declined/)
    expect(calls.some((c) => c.path === `/v1/handoffs/${ID}/decline`)).toBe(true)
  })

  test('an offer taken by someone else says so', async () => {
    const { user } = mount(
      route(
        'POST',
        `/v1/handoffs/${ID}/accept`,
        failure(409, AGENT_ERRORS['handoff.not_pending'].code)
      )
    )
    await user.click(await screen.findByRole('button', { name: 'Accept' }))
    await waitFor(() =>
      expect(screen.getByText('Someone else took it, or it ran out of time.')).toBeTruthy()
    )
  })

  test('a failed answer keeps the offer so the Rep can retry', async () => {
    const { user } = mount(
      route('POST', `/v1/handoffs/${ID}/accept`, failure(503, 'service.unavailable'))
    )
    await user.click(await screen.findByRole('button', { name: 'Accept' }))
    await screen.findByText(/Close/)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(await screen.findByRole('button', { name: 'Accept' })).toBeTruthy()
  })

  test('a new offer shows at once after an answer', async () => {
    const ID2 = `hof_${'b'.repeat(32)}`
    let answered = false
    const { user } = mount((call) => {
      if (call.method === 'POST') {
        answered = true
        return json(200, handoff('accepted'))
      }
      if (call.path === '/v1/handoffs') {
        return json(200, {
          items: [answered ? { ...handoff(), id: ID2 } : handoff()],
          nextCursor: null,
        })
      }
      if (call.path === `/v1/handoffs/${ID2}`) {
        return json(200, { ...context, handoffId: ID2 })
      }
      return null
    })
    await user.click(await screen.findByRole('button', { name: 'Accept' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy())
  })
})
