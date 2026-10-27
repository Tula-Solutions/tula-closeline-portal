import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { hexId } from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const TRY_ID = `try_${'0'.repeat(31)}1`
const SESSIONS = '/v1/agent/try-sessions'
const MESSAGES = `${SESSIONS}/${TRY_ID}/messages`
const turn = (extra: Record<string, unknown> = {}) => ({
  index: 1,
  role: 'agent',
  text: 'Our Pro plan is 49 dollars a seat.',
  sources: [{ documentId: hexId('doc', 1), page: 3, passage: 'Pro is 49 per seat per month.' }],
  deferred: false,
  toolCall: null,
  at: '2026-10-01T10:00:00.000Z',
  ...extra,
})
const session = () =>
  json(201, {
    id: TRY_ID,
    opening: turn({
      index: 0,
      text: 'Hi, I am an AI assistant.',
      sources: [],
    }),
    expiresAt: '2026-10-01T11:00:00.000Z',
  })
const empty = json(200, { items: [], nextCursor: null })
const quiet: Handler[] = [
  route('GET', '/v1/agent/settings', failure(404, 'request.not_found')),
  route('GET', '/v1/agent/questions', empty),
  route('GET', '/v1/agent-controls', empty),
  route('GET', '/v1/agent-instructions/inbound/versions', empty),
  route('GET', '/v1/playbook/documents', json(200, { items: [], nextCursor: null })),
]
const running = route(
  'GET',
  '/v1/agent-controls/organization-pause',
  json(200, { paused: false, updatedAt: null, updatedByMembershipId: null })
)

function visit(role: 'owner' | 'admin' | 'manager', ...handlers: Handler[]) {
  return renderPortal({
    url: '/agent',
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers: [...handlers, ...quiet],
  })
}

async function start(portal: ReturnType<typeof visit>) {
  await portal.user.click(await screen.findByRole('button', { name: 'Start a conversation' }))
  await screen.findByText('Hi, I am an AI assistant.')
}

async function say(portal: ReturnType<typeof visit>, words: string) {
  await portal.user.type(screen.getByLabelText('Say something to the Agent'), words)
  await portal.user.click(screen.getByRole('button', { name: 'Send' }))
}

afterEach(() => {
  document.documentElement.classList.remove('dark')
  cleanup()
})

describe('Try your Agent: who can use it', () => {
  test('a Manager gets a notice and no request', async () => {
    const portal = visit('manager', running)
    await screen.findByText('Only an Owner or Admin can try the Agent.')
    expect(portal.calls.filter((call) => call.path.startsWith(SESSIONS))).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Start a conversation' })).toBeNull()
  })

  test('an empty conversation says so and sends nothing until started', async () => {
    const portal = visit('admin', running)
    await screen.findByText(/No conversation yet/)
    expect(portal.calls.filter((call) => call.path.startsWith(SESSIONS))).toHaveLength(0)
  })
})

describe('Try your Agent: a conversation', () => {
  test('a scripted answer shows its source beside it, with idempotency keys', async () => {
    const portal = visit(
      'owner',
      running,
      route('POST', SESSIONS, session),
      route('POST', MESSAGES, json(200, { reply: turn() }))
    )
    await start(portal)
    await say(portal, 'What does Pro cost?')
    await screen.findByText('Our Pro plan is 49 dollars a seat.')
    expect(screen.getByText('Pro is 49 per seat per month.')).toBeTruthy()
    expect(screen.getByText(/page 3/)).toBeTruthy()
    const calls = portal.calls.filter((call) => call.method === 'POST')
    expect(calls.map((call) => call.headers.get('idempotency-key')).every(Boolean)).toBe(true)
    expect(calls[1]?.body).toEqual({ text: 'What does Pro cost?' })
  })

  test('an unknown question shows the deferral', async () => {
    const portal = visit(
      'owner',
      running,
      route('POST', SESSIONS, session),
      route(
        'POST',
        MESSAGES,
        json(200, { reply: turn({ text: 'Someone will follow up.', sources: [], deferred: true }) })
      )
    )
    await start(portal)
    await say(portal, 'Do you support Klingon?')
    expect(await screen.findByText('Deferred.')).toBeTruthy()
  })

  test('a tool call is shown beside the answer', async () => {
    const portal = visit(
      'owner',
      running,
      route('POST', SESSIONS, session),
      route(
        'POST',
        MESSAGES,
        json(200, { reply: turn({ sources: [], toolCall: { name: 'book' } }) })
      )
    )
    await start(portal)
    await say(portal, 'Book me in')
    expect(await screen.findByText('Booked a meeting.')).toBeTruthy()
  })

  test('answer text stays plain text', async () => {
    const portal = visit(
      'owner',
      running,
      route('POST', SESSIONS, session),
      route(
        'POST',
        MESSAGES,
        json(200, {
          reply: turn({ text: '<script>alert(1)</script> [x](http://evil.test)', sources: [] }),
        })
      )
    )
    await start(portal)
    await say(portal, 'hi')
    expect(await screen.findByText(/<script>alert\(1\)<\/script>/)).toBeTruthy()
    expect(document.querySelector('script[src], a[href*="evil"]')).toBeNull()
  })

  test('an error shows its words by code and Try again works', async () => {
    let tries = 0
    const portal = visit(
      'owner',
      running,
      route('POST', SESSIONS, () => {
        tries += 1
        return tries === 1 ? failure(409, 'agent.no_published_instructions') : session()
      })
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Start a conversation' }))
    expect(await screen.findByText(/no published instructions/)).toBeTruthy()
    await portal.user.click(
      within(screen.getByRole('region', { name: 'Try your Agent' })).getByRole('button', {
        name: 'Try again',
      })
    )
    await screen.findByText('Hi, I am an AI assistant.')
  })

  test('an expired session says so and start over begins again', async () => {
    const portal = visit(
      'owner',
      running,
      route('POST', SESSIONS, session),
      route('POST', MESSAGES, failure(404, 'agent.session_not_found'))
    )
    await start(portal)
    await say(portal, 'hello')
    expect(await screen.findByText(/This conversation has ended/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start a conversation' })).toBeTruthy()
  })

  test('start over clears the transcript', async () => {
    const portal = visit('owner', running, route('POST', SESSIONS, session))
    await start(portal)
    await portal.user.click(screen.getByRole('button', { name: 'Start over' }))
    expect(screen.queryByText('Hi, I am an AI assistant.')).toBeNull()
  })

  test('paused Agents: a notice and no session is started', async () => {
    const portal = visit(
      'owner',
      route(
        'GET',
        '/v1/agent-controls/organization-pause',
        json(200, {
          paused: true,
          updatedAt: '2026-10-01T10:00:00.000Z',
          updatedByMembershipId: hexId('mem', 1),
        })
      ),
      route('POST', SESSIONS, session)
    )
    await screen.findByText(/will not answer/)
    await portal.user.click(screen.getByRole('button', { name: 'Start a conversation' }))
    expect(portal.calls.filter((call) => call.path === SESSIONS)).toHaveLength(0)
  })
})

describe('Try your Agent: guards and retries', () => {
  const region = () => within(screen.getByRole('region', { name: 'Try your Agent' }))
  const posts = (portal: ReturnType<typeof visit>, path: string) =>
    portal.calls.filter((call) => call.method === 'POST' && call.path === path)

  test('Send makes no request while the Agents are paused', async () => {
    let answered = 0
    const portal = visit(
      'owner',
      route('GET', '/v1/agent-controls/organization-pause', failure(500, 'service.unavailable')),
      route('POST', SESSIONS, session),
      route('POST', MESSAGES, () => {
        answered += 1
        return failure(409, 'agent.paused')
      })
    )
    await start(portal)
    await say(portal, 'first')
    await screen.findByText(/The Agents are paused, so the Agent will not answer/)
    await portal.user.type(screen.getByLabelText('Say something to the Agent'), 'second')
    await portal.user.click(screen.getByRole('button', { name: 'Send' }))
    expect(posts(portal, MESSAGES)).toHaveLength(1)
    expect(answered).toBe(1)
  })

  test('a paused answer does not stick once the pause switch says running', async () => {
    let tries = 0
    const portal = visit(
      'owner',
      running,
      route('POST', SESSIONS, () => {
        tries += 1
        return tries === 1 ? failure(409, 'agent.paused') : session()
      })
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Start a conversation' }))
    await screen.findByText(/The Agents are paused\. Resume them/)
    await portal.user.click(region().getByRole('button', { name: 'Start a conversation' }))
    await screen.findByText('Hi, I am an AI assistant.')
    expect(posts(portal, SESSIONS)).toHaveLength(2)
  })

  test('Start over is disabled while a reply is in flight and keeps focus', async () => {
    let release: (answer: Response) => void = () => {}
    const portal = visit(
      'owner',
      running,
      route('POST', SESSIONS, session),
      route('POST', MESSAGES, () => new Promise<Response>((resolve) => (release = resolve)))
    )
    await start(portal)
    await say(portal, 'slow one')
    await screen.findByText('The Agent is thinking...')
    const over = screen.getByRole('button', { name: 'Start over' })
    expect(over.getAttribute('aria-disabled')).toBe('true')
    await portal.user.click(over)
    expect(screen.getByText('Hi, I am an AI assistant.')).toBeTruthy()
    release(json(200, { reply: turn() }))
    await screen.findByText('Our Pro plan is 49 dollars a seat.')
  })

  test('Try again after a failed send resends the same text with the same key', async () => {
    let tries = 0
    const portal = visit(
      'owner',
      running,
      route('POST', SESSIONS, session),
      route('POST', MESSAGES, () => {
        tries += 1
        return tries === 1 ? failure(503, 'service.unavailable') : json(200, { reply: turn() })
      })
    )
    await start(portal)
    await say(portal, 'What does Pro cost?')
    await portal.user.click(await region().findByRole('button', { name: 'Try again' }))
    await screen.findByText('Our Pro plan is 49 dollars a seat.')
    const sent = posts(portal, MESSAGES)
    expect(sent).toHaveLength(2)
    expect(sent[1]?.body).toEqual(sent[0]?.body)
    expect(sent[1]?.headers.get('idempotency-key')).toBe(sent[0]?.headers.get('idempotency-key'))
  })

  test('no Try again is offered once the Agents are paused', async () => {
    const portal = visit(
      'owner',
      running,
      route('POST', SESSIONS, session),
      route('POST', MESSAGES, () => failure(409, 'agent.paused'))
    )
    await start(portal)
    await say(portal, 'What does Pro cost?')
    await screen.findByText(/The Agents are paused/)
    expect(region().queryByRole('button', { name: 'Try again' })).toBeNull()
  })
})

describe('Try your Agent: accessibility', () => {
  test.each(['light', 'dark'] as const)('passes axe in %s with a conversation', async (theme) => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    }
    const portal = visit(
      'owner',
      running,
      route('POST', SESSIONS, session),
      route('POST', MESSAGES, json(200, { reply: turn() }))
    )
    await start(portal)
    await say(portal, 'What does Pro cost?')
    await screen.findByText('Our Pro plan is 49 dollars a seat.')
    await waitFor(() => expect(screen.getByText(/page 3/)).toBeTruthy())
    const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
    expect(result.violations.map((violation) => violation.id)).toEqual([])
  })
})
