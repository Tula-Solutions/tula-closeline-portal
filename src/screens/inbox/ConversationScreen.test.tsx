import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { INBOX_ERRORS } from 'tula-closeline-contract'
import {
  conversationBody,
  draftBody,
  hexId,
  memberBody,
  messageBody,
  page,
  prospectBody,
} from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const ONE = hexId('cnv', 1)
const CONVERSATION = `/v1/conversations/${ONE}`
const MESSAGES = `${CONVERSATION}/messages`
const XSS = '<img src=x onerror=alert(1)>'

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', ...handlers: Handler[]) {
  return renderPortal({
    url: `/inbox/${ONE}`,
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers: [
      ...handlers,
      route('GET', `/v1/prospects/${hexId('prs', 1)}`, json(200, prospectBody(1))),
      route('GET', '/v1/members', json(200, page([memberBody(2, { name: 'Maya Chen' })]))),
    ],
  })
}

afterEach(() => {
  document.documentElement.classList.remove('dark')
  cleanup()
})

describe('Conversation: the transcript', () => {
  test('shows the Prospect, state, label and the Messages oldest first', async () => {
    visit(
      'rep',
      route(
        'GET',
        CONVERSATION,
        json(200, conversationBody(1, { state: 'escalated', latestLabel: 'objection' }))
      ),
      route(
        'GET',
        MESSAGES,
        json(
          200,
          page([
            messageBody(1, 1, {
              body: 'We are not sure about the price.',
              classification: {
                label: 'objection',
                confidence: 0.9,
                decidedBy: 'model',
                correctedByMembershipId: null,
                classifiedAt: '2026-10-05T10:01:00Z',
              },
            }),
            messageBody(2, 1, {
              direction: 'outbound',
              authorKind: 'agent',
              body: 'Here is how the price breaks down.',
            }),
          ])
        )
      )
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'First1 Last1' })).toBeTruthy()
    const list = await screen.findByRole('list', { name: 'Messages' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect((items[0] as HTMLElement).textContent).toContain('Prospect')
    expect((items[0] as HTMLElement).textContent).toContain('We are not sure about the price.')
    expect((items[0] as HTMLElement).textContent).toContain('Objection')
    expect((items[1] as HTMLElement).textContent).toContain('Agent')
    expect(screen.getByText('Needs a person')).toBeTruthy()
    expect(
      screen
        .getAllByRole('link', { name: 'Inbox' })
        .every((l) => l.getAttribute('href') === '/inbox')
    ).toBe(true)
  })

  test('a body is shown as text, never as HTML', async () => {
    visit(
      'rep',
      route('GET', CONVERSATION, json(200, conversationBody(1))),
      route('GET', MESSAGES, json(200, page([messageBody(1, 1, { body: XSS })])))
    )
    const list = await screen.findByRole('list', { name: 'Messages' })
    expect(within(list).getByText(XSS)).toBeTruthy()
    expect(document.querySelector('img')).toBeNull()
    expect(list.querySelector('[onerror]')).toBeNull()
  })

  test('says the Agent is writing, or names the Rep', async () => {
    visit(
      'owner',
      route(
        'GET',
        CONVERSATION,
        json(
          200,
          conversationBody(1, {
            controller: 'rep',
            controllerMembershipId: hexId('mem', 2),
            state: 'rep',
          })
        )
      ),
      route('GET', MESSAGES, json(200, page([messageBody(1, 1)])))
    )
    expect(await screen.findByText('Maya Chen')).toBeTruthy()
  })

  test('the Agent is named as the writer when it controls the Conversation', async () => {
    visit(
      'rep',
      route('GET', CONVERSATION, json(200, conversationBody(1))),
      route('GET', MESSAGES, json(200, page([messageBody(1, 1)])))
    )
    expect(await screen.findByText('The Agent')).toBeTruthy()
  })

  test('a Rep who cannot list members sees "A Rep" and no member is requested', async () => {
    const portal = visit(
      'rep',
      route(
        'GET',
        CONVERSATION,
        json(
          200,
          conversationBody(1, {
            controller: 'rep',
            controllerMembershipId: hexId('mem', 2),
            state: 'rep',
          })
        )
      ),
      route('GET', MESSAGES, json(200, page([messageBody(1, 1)])))
    )
    expect(await screen.findByText('A Rep')).toBeTruthy()
    expect(portal.calls.some((call) => call.path === '/v1/members')).toBe(false)
  })

  test('Load more asks for the next page of Messages with its cursor', async () => {
    const portal = visit(
      'rep',
      route('GET', CONVERSATION, json(200, conversationBody(1))),
      route('GET', MESSAGES, (call) =>
        new URL(call.url, 'http://x').searchParams.get('cursor') === 'm2'
          ? json(200, page([messageBody(3, 1, { body: 'Third' })]))
          : json(200, page([messageBody(1, 1, { body: 'First' }), messageBody(2, 1)], 'm2'))
      )
    )
    await screen.findByText('First')
    await portal.user.click(screen.getByRole('button', { name: 'Load more Messages' }))
    await screen.findByText('Third')
    expect(portal.calls.filter((call) => call.path === MESSAGES)).toHaveLength(2)
  })

  test('a Conversation that is not found or not visible is said so plainly, with a way back', async () => {
    const portal = visit(
      'rep',
      route('GET', CONVERSATION, failure(404, INBOX_ERRORS['inbox.conversation_not_found'].code)),
      route('GET', MESSAGES, failure(404, INBOX_ERRORS['inbox.conversation_not_found'].code))
    )
    expect((await screen.findByRole('alert')).textContent).toContain(
      'does not exist, or it is not one you can see'
    )
    // No Prospect is asked for before the Conversation names one (an empty id hits the list route).
    expect(portal.calls.some((call) => call.path.replace(/\/$/, '') === '/v1/prospects')).toBe(
      false
    )
    expect(screen.getByRole('link', { name: 'Back to the inbox' }).getAttribute('href')).toBe(
      '/inbox'
    )
  })

  test('a Conversation with no Message yet says so', async () => {
    visit(
      'rep',
      route('GET', CONVERSATION, json(200, conversationBody(1))),
      route('GET', MESSAGES, json(200, page([])))
    )
    expect(await screen.findByText('No Message yet.')).toBeTruthy()
  })

  test('passes axe in light and dark', async () => {
    visit(
      'rep',
      route('GET', CONVERSATION, json(200, conversationBody(1))),
      route('GET', MESSAGES, json(200, page([messageBody(1, 1)])))
    )
    await screen.findByRole('list', { name: 'Messages' })
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('First1 Last1')
    )
    const run = async () =>
      (
        await axe.run(screen.getByRole('main'), { rules: { 'color-contrast': { enabled: false } } })
      ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
    expect(await run()).toEqual([])
    document.documentElement.classList.add('dark')
    expect(await run()).toEqual([])
  })
})

describe('Conversation: takeover, reply and hand back', () => {
  const REP = hexId('mem', 2)
  const taken = () =>
    conversationBody(1, { controller: 'rep', controllerMembershipId: REP, state: 'rep' })

  /** Core's side: the Conversation changes hands when a takeover or hand back arrives. */
  function core() {
    let current: Record<string, unknown> = conversationBody(1)
    return [
      route('GET', CONVERSATION, () => json(200, current)),
      route('GET', MESSAGES, json(200, page([messageBody(1, 1)]))),
      route('POST', `${CONVERSATION}/takeover`, () => {
        current = taken()
        return json(200, current)
      }),
      route('POST', `${CONVERSATION}/handback`, () => {
        current = conversationBody(1)
        return json(200, current)
      }),
      route('POST', `${CONVERSATION}/replies`, json(202, draftBody(1))),
    ]
  }

  test('after a takeover the next render shows the Agent stopped and the Rep as author', async () => {
    const portal = visit('rep', ...core())
    expect(await screen.findByText('The Agent')).toBeTruthy()
    await portal.user.click(await screen.findByRole('button', { name: 'Take over' }))
    expect(await screen.findByText(/The Agent has stopped/)).toBeTruthy()
    // A Rep cannot list members, so the author reads "A Rep".
    expect(await screen.findByText('A Rep')).toBeTruthy()
    expect(screen.queryByText('The Agent')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Take over' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Hand back to the Agent' })).toBeTruthy()
    const post = portal.calls.find((call) => call.path === `${CONVERSATION}/takeover`)
    expect(post?.headers.get('Idempotency-Key')).toBeTruthy()
  })

  test('replies as the Rep while in control, then hands back', async () => {
    const portal = visit('rep', ...core())
    await portal.user.click(await screen.findByRole('button', { name: 'Take over' }))
    const box = await screen.findByLabelText('Your reply')
    await portal.user.type(box, 'Thanks, I can send the quote today.')
    await portal.user.click(screen.getByRole('button', { name: 'Send reply' }))
    await waitFor(() => {
      const reply = portal.calls.find((call) => call.path === `${CONVERSATION}/replies`)
      expect(reply?.body).toEqual({ body: 'Thanks, I can send the quote today.' })
      expect(reply?.headers.get('Idempotency-Key')).toBeTruthy()
    })
    expect(await screen.findByText(/Reply sent to the channel/)).toBeTruthy()
    expect((screen.getByLabelText('Your reply') as HTMLTextAreaElement).value).toBe('')
    await portal.user.click(screen.getByRole('button', { name: 'Hand back to the Agent' }))
    expect(await screen.findByText(/Handed back/)).toBeTruthy()
    expect(await screen.findByText('The Agent')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Take over' })).toBeTruthy()
    expect(screen.queryByLabelText('Your reply')).toBeNull()
  })

  test('refuses an empty reply without asking core', async () => {
    const portal = visit('rep', ...core())
    await portal.user.click(await screen.findByRole('button', { name: 'Take over' }))
    await portal.user.click(await screen.findByRole('button', { name: 'Send reply' }))
    expect(await screen.findByText(/Write a reply/)).toBeTruthy()
    expect(portal.calls.some((call) => call.path === `${CONVERSATION}/replies`)).toBe(false)
  })

  test('words a refused takeover from the code, not the status', async () => {
    const portal = visit(
      'rep',
      route('GET', CONVERSATION, json(200, conversationBody(1))),
      route('GET', MESSAGES, json(200, page([messageBody(1, 1)]))),
      route(
        'POST',
        `${CONVERSATION}/takeover`,
        failure(409, INBOX_ERRORS['inbox.already_controlled'].code)
      )
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Take over' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/already/i)
    expect(alert.textContent).not.toContain('Text the portal never shows.')
    expect(screen.getByRole('button', { name: 'Take over' })).toBeTruthy()
  })

  test('a closed Conversation offers no control', async () => {
    visit(
      'rep',
      route('GET', CONVERSATION, json(200, conversationBody(1, { state: 'closed' }))),
      route('GET', MESSAGES, json(200, page([messageBody(1, 1)])))
    )
    expect(await screen.findByText(/is closed/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Take over' })).toBeNull()
    expect(screen.queryByLabelText('Your reply')).toBeNull()
  })

  test('has no accessibility violations while the Rep is in control', async () => {
    visit(
      'rep',
      route('GET', CONVERSATION, json(200, taken())),
      route('GET', MESSAGES, json(200, page([messageBody(1, 1)])))
    )
    await screen.findByLabelText('Your reply')
    const results = await axe.run(screen.getByRole('main'), {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations.map((v) => v.id)).toEqual([])
  })
})
