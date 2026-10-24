import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { ERRORS, INBOX_ERRORS } from 'tula-closeline-contract'
import {
  decisionBody,
  draftBody,
  hexId,
  page,
  queueItemBody,
  sourceBody,
} from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const DRAFT = `/v1/drafts/${hexId('drf', 1)}`
const XSS = '<img src=x onerror=alert(1)>'

const PASSAGES = json(200, {
  items: [
    {
      source: sourceBody(1),
      passage: 'Pricing is per seat, billed yearly.',
    },
  ],
})

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', ...handlers: Handler[]) {
  return renderPortal({
    url: `/inbox/approvals/${hexId('drf', 1)}`,
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers: [
      ...handlers,
      route('GET', '/v1/approvals', json(200, page([queueItemBody(1)]))),
      route('GET', '/v1/decisions', json(200, page([]))),
    ],
  })
}

function idempotencyKeys(portal: ReturnType<typeof renderPortal>, suffix: string) {
  return portal.calls
    .filter((call) => call.method === 'POST' && call.path === `${DRAFT}/${suffix}`)
    .map((call) => call.headers.get('idempotency-key'))
}

afterEach(() => {
  document.documentElement.classList.remove('dark')
  cleanup()
})

describe('Draft panel: reading', () => {
  test('shows the Draft, why it was written, why it waits, and the cited passages as numbered notes', async () => {
    visit(
      'rep',
      route('GET', DRAFT, json(200, draftBody(1))),
      route('GET', `${DRAFT}/sources`, PASSAGES)
    )
    expect(await screen.findByRole('textbox', { name: 'Reply' })).toBeTruthy()
    expect(screen.getByText('Answer the pricing question and offer a time.')).toBeTruthy()
    expect(screen.getByText(/approval policy asks for a person/)).toBeTruthy()
    const sources = await screen.findByRole('list', { name: 'Sources' })
    expect(within(sources).getByText('Pricing is per seat, billed yearly.')).toBeTruthy()
  })

  test('renders a passage and the Draft as text, never as markup', async () => {
    visit(
      'rep',
      route('GET', DRAFT, json(200, draftBody(1, { body: XSS }))),
      route(
        'GET',
        `${DRAFT}/sources`,
        json(200, { items: [{ source: sourceBody(1), passage: XSS }] })
      )
    )
    await waitFor(() =>
      expect(screen.getAllByText(XSS, { exact: false }).length).toBeGreaterThan(1)
    )
    expect(document.querySelector('img[src="x"]')).toBeNull()
  })

  test('marks a Draft with no Source in words, and says the passages could not be loaded without hiding the Draft', async () => {
    visit(
      'rep',
      route('GET', DRAFT, json(200, draftBody(1, { ungrounded: true }))),
      route('GET', `${DRAFT}/sources`, failure(503, ERRORS['server.unavailable'].code))
    )
    expect(await screen.findByText(/cites no Playbook source/i)).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Reply' })).toBeTruthy()
  })

  test('keeps the Draft readable when its sources cannot be loaded, and says so', async () => {
    visit(
      'rep',
      route('GET', DRAFT, json(200, draftBody(1))),
      route('GET', `${DRAFT}/sources`, failure(503, ERRORS['server.unavailable'].code))
    )
    expect(await screen.findByRole('textbox', { name: 'Reply' })).toBeTruthy()
    expect((await screen.findByRole('alert')).textContent).toContain('passages')
  })

  test('says a missing Draft plainly, with a way back', async () => {
    visit(
      'rep',
      route('GET', DRAFT, failure(404, INBOX_ERRORS['inbox.draft_not_found'].code)),
      route('GET', `${DRAFT}/sources`, failure(404, INBOX_ERRORS['inbox.draft_not_found'].code))
    )
    expect((await screen.findByRole('alert')).textContent).toContain('does not exist')
    expect(screen.getByRole('link', { name: 'Back to the approval queue' })).toBeTruthy()
  })

  test('a Draft already decided is read-only', async () => {
    visit(
      'rep',
      route('GET', DRAFT, json(200, draftBody(1, { status: 'approved' }))),
      route('GET', `${DRAFT}/sources`, PASSAGES)
    )
    await screen.findByText('Approved')
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  test('a Rep who may not decide it reads it with no buttons', async () => {
    visit(
      'rep',
      route('GET', DRAFT, json(200, draftBody(1))),
      route('GET', `${DRAFT}/sources`, PASSAGES),
      route('GET', '/v1/approvals', json(200, page([queueItemBody(1, { canApprove: false })])))
    )
    expect(await screen.findByText(/owns this Conversation/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  test('shows the decisions with their notes to an Admin, and asks for none from a Rep', async () => {
    const admin = visit(
      'admin',
      route('GET', DRAFT, json(200, draftBody(1, { status: 'rejected' }))),
      route('GET', `${DRAFT}/sources`, PASSAGES),
      route(
        'GET',
        '/v1/decisions',
        json(200, page([decisionBody(1, { kind: 'reject', note: XSS })]))
      )
    )
    expect(await screen.findByText(XSS)).toBeTruthy()
    expect(admin.calls.some((call) => call.path === '/v1/decisions')).toBe(true)
    cleanup()
    const rep = visit(
      'rep',
      route('GET', DRAFT, json(200, draftBody(1, { status: 'rejected' }))),
      route('GET', `${DRAFT}/sources`, PASSAGES)
    )
    await screen.findByText('Rejected')
    expect(rep.calls.some((call) => call.path === '/v1/decisions')).toBe(false)
  })

  test('has no accessibility violations', async () => {
    visit(
      'admin',
      route('GET', DRAFT, json(200, draftBody(1))),
      route('GET', `${DRAFT}/sources`, PASSAGES)
    )
    await screen.findByRole('list', { name: 'Sources' })
    const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
    expect(result.violations).toEqual([])
  })
})

describe('Draft panel: deciding', () => {
  test('approves as written with an Idempotency-Key and no body', async () => {
    const portal = visit(
      'rep',
      route('GET', DRAFT, json(200, draftBody(1))),
      route('GET', `${DRAFT}/sources`, PASSAGES),
      route('POST', `${DRAFT}/approve`, json(200, draftBody(1, { status: 'approved' })))
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(idempotencyKeys(portal, 'approve')).toHaveLength(1))
    const post = portal.calls.find((call) => call.path === `${DRAFT}/approve`)
    expect(post?.headers.get('idempotency-key')).toMatch(/^[A-Za-z0-9_.:-]{16,128}$/)
    expect(post?.body).toEqual({ acknowledgeUngrounded: false })
    expect(await screen.findByText('Approved.')).toBeTruthy()
  })

  test('sends the edited text as the body when it was changed', async () => {
    const portal = visit(
      'rep',
      route('GET', DRAFT, json(200, draftBody(1))),
      route('GET', `${DRAFT}/sources`, PASSAGES),
      route('POST', `${DRAFT}/approve`, json(200, draftBody(1, { status: 'approved' })))
    )
    const box = await screen.findByRole('textbox', { name: 'Reply' })
    await portal.user.clear(box)
    await portal.user.type(box, 'A shorter reply.')
    await portal.user.click(screen.getByRole('button', { name: 'Approve with edits' }))
    await waitFor(() => expect(idempotencyKeys(portal, 'approve')).toHaveLength(1))
    const post = portal.calls.find((call) => call.path === `${DRAFT}/approve`)
    expect(post?.body).toEqual({ body: 'A shorter reply.', acknowledgeUngrounded: false })
  })

  test('reuses the key when a try whose outcome is unknown is repeated', async () => {
    let answers = 0
    const portal = visit(
      'rep',
      route('GET', DRAFT, json(200, draftBody(1))),
      route('GET', `${DRAFT}/sources`, PASSAGES),
      route('POST', `${DRAFT}/approve`, () => {
        answers += 1
        return answers === 1
          ? failure(503, ERRORS['server.unavailable'].code)
          : json(200, draftBody(1, { status: 'approved' }))
      })
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Approve' }))
    await screen.findByRole('alert')
    await portal.user.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(idempotencyKeys(portal, 'approve')).toHaveLength(2))
    const [first, second] = idempotencyKeys(portal, 'approve')
    expect(second).toBe(first as string)
  })

  test('an ungrounded Draft needs the confirmation box before it can be approved', async () => {
    const portal = visit(
      'rep',
      route('GET', DRAFT, json(200, draftBody(1, { ungrounded: true }))),
      route('GET', `${DRAFT}/sources`, json(200, { items: [] })),
      route('POST', `${DRAFT}/approve`, json(200, draftBody(1, { status: 'approved' })))
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Approve' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Tick the box')
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
    await portal.user.click(screen.getByRole('checkbox', { name: /checked it/i }))
    await portal.user.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(idempotencyKeys(portal, 'approve')).toHaveLength(1))
    expect(portal.calls.find((call) => call.path === `${DRAFT}/approve`)?.body).toEqual({
      acknowledgeUngrounded: true,
    })
  })

  test('a Draft with a Source has no confirmation box', async () => {
    visit(
      'rep',
      route('GET', DRAFT, json(200, draftBody(1))),
      route('GET', `${DRAFT}/sources`, PASSAGES)
    )
    await screen.findByRole('button', { name: 'Approve' })
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  test('rejects with a note and its own key', async () => {
    const portal = visit(
      'rep',
      route('GET', DRAFT, json(200, draftBody(1))),
      route('GET', `${DRAFT}/sources`, PASSAGES),
      route('POST', `${DRAFT}/reject`, json(200, draftBody(1, { status: 'rejected' })))
    )
    await portal.user.type(
      await screen.findByLabelText('Why reject it? (optional)'),
      'Wrong price.'
    )
    await portal.user.click(screen.getByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(idempotencyKeys(portal, 'reject')).toHaveLength(1))
    const post = portal.calls.find((call) => call.path === `${DRAFT}/reject`)
    expect(post?.headers.get('idempotency-key')).toBeTruthy()
    expect(post?.body).toEqual({ note: 'Wrong price.' })
    expect(await screen.findByText('Rejected.')).toBeTruthy()
  })

  test('rejects with no note when none is written', async () => {
    const portal = visit(
      'rep',
      route('GET', DRAFT, json(200, draftBody(1))),
      route('GET', `${DRAFT}/sources`, PASSAGES),
      route('POST', `${DRAFT}/reject`, json(200, draftBody(1, { status: 'rejected' })))
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(idempotencyKeys(portal, 'reject')).toHaveLength(1))
    expect(portal.calls.find((call) => call.path === `${DRAFT}/reject`)?.body).toEqual({})
  })

  test('a note stops at 500 characters', async () => {
    visit(
      'rep',
      route('GET', DRAFT, json(200, draftBody(1))),
      route('GET', `${DRAFT}/sources`, PASSAGES)
    )
    const note = await screen.findByLabelText('Why reject it? (optional)')
    expect(note.getAttribute('maxlength')).toBe('500')
  })

  test('takeover_required says a Rep has taken over, and links to the Conversation', async () => {
    const portal = visit(
      'rep',
      route('GET', DRAFT, json(200, draftBody(1))),
      route('GET', `${DRAFT}/sources`, PASSAGES),
      route('POST', `${DRAFT}/approve`, failure(409, INBOX_ERRORS['inbox.takeover_required'].code))
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Approve' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('taken over')
    const link = within(alert).getByRole('link', { name: 'Open the Conversation' })
    expect(link.getAttribute('href')).toBe(`/inbox/${hexId('cnv', 1)}`)
  })

  test('says in words when the Draft was decided meanwhile', async () => {
    const portal = visit(
      'rep',
      route('GET', DRAFT, json(200, draftBody(1))),
      route('GET', `${DRAFT}/sources`, PASSAGES),
      route('POST', `${DRAFT}/reject`, failure(409, INBOX_ERRORS['inbox.draft_not_pending'].code))
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Reject' }))
    expect((await screen.findByRole('alert')).textContent).toContain('no longer waiting')
  })

  test('says the permission could not be checked, with a retry, instead of denying it', async () => {
    let healthy = false
    const portal = visit(
      'rep',
      route('GET', DRAFT, json(200, draftBody(1))),
      route('GET', `${DRAFT}/sources`, PASSAGES),
      route('GET', '/v1/approvals', () =>
        healthy
          ? json(200, page([queueItemBody(1)]))
          : failure(503, ERRORS['server.unavailable'].code)
      )
    )
    const alert = await screen.findByRole('alert', {}, { timeout: 5000 })
    expect(alert.textContent).toContain('could not check')
    expect(screen.queryByText(/Only the Rep who owns/)).toBeNull()
    healthy = true
    await portal.user.click(screen.getByRole('button', { name: 'Check again' }))
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeTruthy()
  })
})
