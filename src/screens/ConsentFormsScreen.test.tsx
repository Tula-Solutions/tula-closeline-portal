import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { consentFormBody, hexId, page, wordingBody } from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'
import { choose } from '~/testing/select'

const FORMS = '/v1/consent-forms'
const WORDINGS = '/v1/consent-wordings'
const TOKEN = 'Tk-consent_0123456789abcdef0123456789abcdef'

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', ...handlers: Handler[]) {
  return renderPortal({
    url: '/consent-forms',
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers,
  })
}

// Wording 1 is locked (a published form uses it); wording 2 is not yet used. Both are current.
const wordings = route(
  'GET',
  WORDINGS,
  json(200, page([{ ...wordingBody(2), locked: false }, wordingBody(1)]))
)
const forms = (items: ReturnType<typeof consentFormBody>[]) =>
  route('GET', FORMS, json(200, page(items)))

/** Picks a wording in the Radix list by its id. */
async function pickWording(user: ReturnType<typeof renderPortal>['user'], n: number) {
  await choose(
    user,
    await screen.findByRole('combobox', { name: 'Consent Wording' }),
    hexId('cwd', n)
  )
}

afterEach(() => {
  cleanup()
})

describe('Consent forms: who can build', () => {
  test.each(['manager', 'rep'] as const)('a %s gets a notice and no request', async (role) => {
    const portal = visit(role, forms([]), wordings)
    expect(await screen.findByText(/Only an Owner or Admin can build/)).toBeTruthy()
    expect(portal.calls.filter((call) => call.path.startsWith('/v1/consent'))).toHaveLength(0)
  })
})

describe('Consent forms: the builder and wording lock', () => {
  test('says publishing locks a wording that is still open, and that a used one is locked', async () => {
    const { user } = visit('admin', forms([]), wordings)
    await pickWording(user, 2)
    expect(screen.getByText(/Publishing a form locks it/)).toBeTruthy()
    await pickWording(user, 1)
    expect(screen.getByText(/already in use as evidence/)).toBeTruthy()
  })

  test('previews the exact wording as text with every channel unticked', async () => {
    const { user } = visit('owner', forms([]), wordings)
    await pickWording(user, 2)
    const preview = within(screen.getByLabelText('Preview'))
    expect(preview.getByText(/We may call you about Northline products \(wording 2\)/)).toBeTruthy()
    expect(preview.getAllByText(/not agreed until they tick it/)).toHaveLength(2)
  })

  test('saves a draft with an Idempotency-Key and the chosen channels only', async () => {
    const created = consentFormBody(1, { name: 'Spring webinar' })
    const { user, calls } = visit(
      'owner',
      route('POST', FORMS, json(201, created)),
      forms([]),
      wordings
    )
    await pickWording(user, 2)
    await user.type(screen.getByLabelText('Form name'), 'Spring webinar')
    await user.click(screen.getByRole('checkbox', { name: 'Text message' }))
    await user.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true))
    const post = calls.find((call) => call.method === 'POST')
    expect(post?.headers.get('idempotency-key')?.length).toBeGreaterThanOrEqual(16)
    expect(post?.body).toEqual({
      wordingId: hexId('cwd', 2),
      name: 'Spring webinar',
      channels: ['phone'],
    })
  })

  test('asks for a wording and a name before sending anything', async () => {
    const { user, calls } = visit('owner', forms([]), wordings)
    await user.click(await screen.findByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText(/Choose the Consent Wording/)).toBeTruthy()
    expect(screen.getByText(/Name the form/)).toBeTruthy()
    expect(calls.some((call) => call.method === 'POST')).toBe(false)
  })
})

describe('Consent forms: the list', () => {
  const draft = consentFormBody(1, { name: 'Draft <b>one</b>', wordingId: hexId('cwd', 2) })
  const live = consentFormBody(2, {
    name: 'Live form',
    state: 'published',
    token: TOKEN,
    publishedAt: '2026-09-03T00:00:00Z',
  })

  test('shows each form with its wording lock state, names as text, and no token', async () => {
    visit('admin', forms([draft, live]), wordings)
    const items = within(await screen.findByRole('list', { name: 'Consent forms' }))
    await waitFor(() => expect(document.body.textContent).not.toContain('Wording not loaded'))
    expect(items.getByText('Draft <b>one</b>')).toBeTruthy()
    const rows = items.getAllByRole('listitem').map((row) => row.textContent)
    expect(rows[0]).toContain('can still be edited')
    expect(rows[1]).toContain('locked')
    expect(document.body.textContent).not.toContain(TOKEN)
  })

  test('publishing states its effect, then calls publish and refreshes the wording', async () => {
    const { user, calls } = visit(
      'admin',
      route('POST', `${FORMS}/${draft.id}/publication`, json(200, { ...live, id: draft.id })),
      forms([draft]),
      wordings
    )
    await user.click(await screen.findByRole('button', { name: /^Publish Draft/ }))
    expect(
      screen.getByText(/gets a public link, and its wording \(version 1\) is locked/)
    ).toBeTruthy()
    expect(calls.some((call) => call.path.endsWith('/publication'))).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Publish form' }))
    await waitFor(() => expect(calls.some((call) => call.path.endsWith('/publication'))).toBe(true))
    await waitFor(() =>
      expect(
        calls.filter((call) => call.method === 'GET' && call.path === WORDINGS).length
      ).toBeGreaterThan(1)
    )
  })

  test('a form that already changed state says so', async () => {
    const { user } = visit(
      'admin',
      route('POST', `${FORMS}/${draft.id}/publication`, failure(409, 'request.conflict')),
      forms([draft]),
      wordings
    )
    await user.click(await screen.findByRole('button', { name: /^Publish Draft/ }))
    await user.click(screen.getByRole('button', { name: 'Publish form' }))
    expect(await screen.findByText(/already changed state/)).toBeTruthy()
  })

  test('copies the hosted link only for a published form, and closing asks first', async () => {
    const { user, calls } = visit(
      'admin',
      route(
        'POST',
        `${FORMS}/${live.id}/closure`,
        json(200, { ...live, state: 'closed', closedAt: '2026-09-04T00:00:00Z' })
      ),
      forms([draft, live]),
      wordings
    )
    await screen.findByRole('list', { name: 'Consent forms' })
    expect(screen.getAllByRole('button', { name: /^Copy link/ })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Close Live form' }))
    expect(screen.getByText(/link stops working/)).toBeTruthy()
    expect(calls.some((call) => call.path.endsWith('/closure'))).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Close form' }))
    await waitFor(() => expect(calls.some((call) => call.path.endsWith('/closure'))).toBe(true))
  })

  test('a link shown after a copy failure goes away once the form is closed', async () => {
    const { user } = visit(
      'admin',
      route(
        'POST',
        `${FORMS}/${live.id}/closure`,
        json(200, { ...live, state: 'closed', token: null, closedAt: '2026-09-04T00:00:00Z' })
      ),
      forms([live]),
      wordings
    )
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('denied')) },
    })
    await user.click(await screen.findByRole('button', { name: /^Copy link/ }))
    expect(await screen.findByLabelText('Link for Live form')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Close Live form' }))
    await user.click(screen.getByRole('button', { name: 'Close form' }))
    await waitFor(() => expect(screen.queryByLabelText('Link for Live form')).toBeNull())
  })

  test('has no accessibility violations', async () => {
    visit('admin', forms([draft, live]), wordings)
    await screen.findByRole('list', { name: 'Consent forms' })
    const result = await axe.run(document.body)
    expect(result.violations).toEqual([])
  })
})
