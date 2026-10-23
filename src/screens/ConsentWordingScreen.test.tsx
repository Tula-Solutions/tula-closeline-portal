import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { hexId, page, teamBody, wordingBody } from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const WORDINGS = '/v1/consent-wordings'
const wording = (n: number) => `${WORDINGS}/${hexId('cwd', n)}`

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', ...handlers: Handler[]) {
  return renderPortal({
    url: '/consent-wordings',
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers,
  })
}

// Newest first: version 2 replaces version 1 of the phone and text-message wording; email is unused so far.
const list = route(
  'GET',
  WORDINGS,
  json(
    200,
    page([
      { ...wordingBody(3, { text: 'Email us <b>ok</b>?', channels: ['email'] }), locked: false },
      { ...wordingBody(2, { version: 2 }), supersedesId: hexId('cwd', 1) },
      wordingBody(1),
    ])
  )
)

afterEach(() => {
  document.documentElement.classList.remove('dark')
  cleanup()
})

describe('Consent Wording: reading', () => {
  test.each(['manager', 'rep'] as const)('a %s reads it and has no way to write', async (role) => {
    const portal = visit(role, list)
    const items = within(await screen.findByRole('list', { name: 'Consent Wordings' }))
    expect(items.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText(/Only an Owner or Admin can write/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Write wording' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull()
    expect(screen.queryByRole('button', { name: /new version/i })).toBeNull()
    expect(portal.calls.every((call) => call.method === 'GET')).toBe(true)
  })

  test('shows text as text and the version in use for each channel', async () => {
    visit('rep', list)
    const items = within(await screen.findByRole('list', { name: 'Consent Wordings' }))
    expect(items.getByText('Email us <b>ok</b>?')).toBeTruthy()
    const coverage = within(screen.getByRole('region', { name: 'Wording in use by channel' }))
    const rows = coverage.getAllByRole('listitem').map((row) => row.textContent)
    expect(rows.find((row) => row?.startsWith('Phone'))).toContain('Version 2')
    expect(rows.find((row) => row?.startsWith('Email'))).toContain('Version 1')
    expect(rows.find((row) => row?.startsWith('LinkedIn'))).toContain('No Consent Wording covers')
  })

  test('says when there is none', async () => {
    visit('owner', route('GET', WORDINGS, json(200, page([]))))
    expect(await screen.findByText('No Consent Wording yet.')).toBeTruthy()
  })

  test('says what went wrong when the list cannot be loaded', async () => {
    visit('owner', route('GET', WORDINGS, failure(403, 'auth.forbidden')))
    expect(await screen.findByRole('alert')).toBeTruthy()
  })

  test('has no switch for consent, AI or recording disclosure', async () => {
    visit('owner', list)
    await screen.findByRole('list', { name: 'Consent Wordings' })
    const main = within(screen.getByRole('main'))
    expect(main.queryByText(/disable|turn off|skip/i)).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /disclos|record/i })).toBeNull()
  })
})

describe('Consent Wording: writing', () => {
  test('creates version 1 with one idempotency key and refreshes', async () => {
    const portal = visit(
      'admin',
      route('POST', WORDINGS, json(201, wordingBody(9, { channels: ['sms'] }))),
      list
    )
    await screen.findByRole('list', { name: 'Consent Wordings' })
    await portal.user.type(
      screen.getByLabelText('Text shown to the Prospect'),
      '  We may text you. '
    )
    await portal.user.click(screen.getByRole('checkbox', { name: 'Text message' }))
    await portal.user.click(screen.getByRole('button', { name: 'Write wording' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Consent Wording written.')
    )
    const post = portal.calls.find((call) => call.method === 'POST')
    expect(post?.body).toEqual({ text: 'We may text you.', channels: ['sms'] })
    expect(post?.headers.get('idempotency-key')).toMatch(/^[A-Za-z0-9_.:-]{16,128}$/)
    expect(portal.calls.filter((c) => c.method === 'GET' && c.path === WORDINGS).length).toBe(2)
  })

  test('refuses empty text and no channel before anything is sent', async () => {
    const portal = visit('owner', list)
    await screen.findByRole('list', { name: 'Consent Wordings' })
    await portal.user.click(screen.getByRole('button', { name: 'Write wording' }))
    const field = screen.getByLabelText('Text shown to the Prospect')
    expect(await screen.findByText(/Write the text a Prospect will be shown/)).toBeTruthy()
    expect(screen.getByText(/Choose at least one channel/)).toBeTruthy()
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
  })

  test('words a server refusal by its code', async () => {
    const portal = visit('owner', route('POST', WORDINGS, failure(422, 'request.invalid')), list)
    await screen.findByRole('list', { name: 'Consent Wordings' })
    const user = portal.user
    await user.type(screen.getByLabelText('Text shown to the Prospect'), 'Text')
    await user.click(screen.getByRole('checkbox', { name: 'Email' }))
    await user.click(screen.getByRole('button', { name: 'Write wording' }))
    expect(await screen.findByText('Check the details you entered and try again.')).toBeTruthy()
  })
})

describe('Consent Wording: editing and versions', () => {
  test('offers Edit only on an unused wording and New version only on one still in use', async () => {
    visit('admin', list)
    await screen.findByRole('list', { name: 'Consent Wordings' })
    expect(screen.getAllByRole('button', { name: /^Edit / })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /^Write a new version/ })).toHaveLength(2)
  })

  test('edits an unused wording with PATCH', async () => {
    const portal = visit(
      'admin',
      route('PATCH', wording(3), json(200, wordingBody(3, { channels: ['email'] }))),
      list
    )
    await screen.findByRole('list', { name: 'Consent Wordings' })
    await portal.user.click(screen.getByRole('button', { name: /^Edit / }))
    const text = screen.getAllByLabelText('Text shown to the Prospect').at(-1) as HTMLElement
    await portal.user.clear(text)
    await portal.user.type(text, 'Fresh text')
    await portal.user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('Consent Wording saved.')
    const patch = portal.calls.find((call) => call.method === 'PATCH')
    expect(patch?.body).toEqual({ text: 'Fresh text', channels: ['email'] })
  })

  test('a wording that core says is locked points to a new version', async () => {
    const portal = visit(
      'admin',
      route('PATCH', wording(3), failure(409, 'consent.wording_locked')),
      list
    )
    await screen.findByRole('list', { name: 'Consent Wordings' })
    await portal.user.click(screen.getByRole('button', { name: /^Edit / }))
    await portal.user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText(/Write a new version instead/)).toBeTruthy()
  })

  test('writes the next version from a wording in use, with a key', async () => {
    const portal = visit(
      'owner',
      route(
        'POST',
        `${wording(2)}/versions`,
        json(201, { ...wordingBody(4, { version: 3 }), supersedesId: hexId('cwd', 2) })
      ),
      list
    )
    await screen.findByRole('list', { name: 'Consent Wordings' })
    const open = screen.getAllByRole('button', { name: /^Write a new version/ })[1] as HTMLElement
    await portal.user.click(open)
    const text = screen.getAllByLabelText('Text shown to the Prospect').at(-1) as HTMLElement
    await portal.user.type(text, ' Updated.')
    await portal.user.click(screen.getByRole('button', { name: 'Write version' }))
    await screen.findByText('New version written.')
    const post = portal.calls.find((call) => call.method === 'POST')
    expect(post?.path).toContain('/versions')
    expect(post?.body).toMatchObject({ channels: expect.any(Array) })
    expect(post?.headers.get('idempotency-key')).toBeTruthy()
  })
})

describe('Consent Wording: navigation and accessibility', () => {
  test.each(['owner', 'rep'] as const)('the nav link is shown to a %s', async (role) => {
    renderPortal({
      url: '/teams',
      signedIn: tokens({ organization: { id: 'org_1', role } }),
      handlers: [route('GET', '/v1/teams', json(200, page([teamBody(1, 'Northern')])))],
    })
    await screen.findByRole('list', { name: 'Teams' })
    expect(screen.getByRole('link', { name: 'Consent Wording' })).toBeTruthy()
  })

  test('passes axe in light and dark with a form open', async () => {
    const portal = visit('admin', list)
    const open = (
      await screen.findAllByRole('button', {
        name: /^Write a new version/,
      })
    )[0] as HTMLElement
    await portal.user.click(open)
    const run = async () =>
      (
        await axe.run(screen.getByRole('main'), { rules: { 'color-contrast': { enabled: false } } })
      ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
    expect(await run()).toEqual([])
    document.documentElement.classList.add('dark')
    expect(await run()).toEqual([])
  })
})
