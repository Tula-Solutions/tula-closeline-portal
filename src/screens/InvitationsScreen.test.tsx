import { describe, expect, test } from 'bun:test'
import { screen, waitFor, within } from '@testing-library/react'
import { CORE_ERRORS, ERRORS } from 'tula-closeline-contract'
import { hexId, invitationBody, page } from '~/testing/core-bodies'
import { failure, json, route, tokens } from '~/testing/fixtures'
import { renderPortal, waitUntilGone } from '~/testing/render'

const INVITATIONS = '/v1/invitations'

type Handlers = Parameters<typeof renderPortal>[0] extends infer O
  ? O extends { handlers?: infer H }
    ? H
    : never
  : never

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', ...handlers: NonNullable<Handlers>) {
  return renderPortal({
    url: '/invitations',
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers,
  })
}

const empty = route('GET', INVITATIONS, json(200, page([])))
const created = (n = 1) => json(201, invitationBody(n))

async function invite(
  portal: ReturnType<typeof visit>,
  email = 'new@northline.app',
  role?: string
) {
  await portal.user.type(await screen.findByLabelText('Email address'), email)
  if (role) {
    await portal.user.selectOptions(screen.getByLabelText('Role offered'), role)
  }
  await portal.user.click(screen.getByRole('button', { name: 'Send Invitation' }))
}

describe('Invitations: the list', () => {
  test('shows pending Invitations with a readable expiry, flags an expired one, and pages with a cursor', async () => {
    const portal = visit(
      'owner',
      route('GET', INVITATIONS, (call) =>
        new URL(call.url, 'http://x').searchParams.get('cursor') === 'c2'
          ? json(200, page([invitationBody(3)]))
          : json(
              200,
              page(
                [
                  invitationBody(1, { role: 'manager', expiresAt: '2099-10-20T09:30:00Z' }),
                  invitationBody(2, { expiresAt: '2020-01-01T00:00:00Z' }),
                ],
                'c2'
              )
            )
      )
    )
    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row')
    const time = rows[1]?.querySelector('time')
    expect(time?.getAttribute('datetime')).toBe('2099-10-20T09:30:00Z')
    expect(time?.textContent).toMatch(/2099/)
    expect(time?.textContent).not.toContain('T09:30:00Z')
    expect(within(rows[1] as HTMLElement).getByText('Manager')).toBeTruthy()
    expect(within(rows[2] as HTMLElement).getByText('(expired)')).toBeTruthy()
    expect(within(rows[1] as HTMLElement).queryByText('(expired)')).toBeNull()
    await portal.user.click(screen.getByRole('button', { name: 'Load more Invitations' }))
    await screen.findByText('invitee3@northline.app')
    const asked = portal.calls.filter((call) => call.path === INVITATIONS)
    expect(asked[0]?.url).toBe('/v1/invitations?limit=25&state=pending')
    expect(asked[1]?.url).toContain('cursor=c2')
  })

  test('says when none are pending, and explains an error with a retry', async () => {
    visit('admin', empty)
    expect(await screen.findByText('No Invitations are pending.')).toBeTruthy()
  })

  test('a failed list is explained', async () => {
    visit('admin', route('GET', INVITATIONS, failure(403, ERRORS['auth.forbidden'].code)))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Your role does not allow this'
    )
  })

  test.each(['manager', 'rep'] as const)(
    'a %s is told their role cannot, and nothing is requested',
    async (role) => {
      const portal = visit(role)
      expect(await screen.findByText(/Your role cannot send or see Invitations/)).toBeTruthy()
      expect(screen.queryByLabelText('Email address')).toBeNull()
      expect(portal.calls.some((call) => call.path === INVITATIONS)).toBe(false)
    }
  )

  test('an email address is text, never markup, and a long one is isolated and cut', async () => {
    visit(
      'owner',
      route(
        'GET',
        INVITATIONS,
        json(
          200,
          page([
            invitationBody(1, { email: '<b>x</b>@n.app' }),
            invitationBody(2, { email: `${'a'.repeat(200)}@n.app` }),
          ])
        )
      )
    )
    await screen.findByText('<b>x</b>@n.app')
    expect(document.querySelector('table b')).toBeNull()
    for (const cell of document.querySelectorAll('tbody th bdi')) {
      expect(cell.className).toBe('clip')
    }
  })
})

describe('Invitations: sending', () => {
  test('sends the address and role with one idempotency key, announces it, clears the form and refetches', async () => {
    const portal = visit('owner', route('POST', INVITATIONS, created()), empty)
    await invite(portal, ' New@Northline.app ', 'manager')
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Invitation sent.'))
    const posts = portal.calls.filter((call) => call.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(posts[0]?.body).toEqual({ email: 'new@northline.app', role: 'manager' })
    expect(posts[0]?.headers.get('idempotency-key')).toMatch(/^[A-Za-z0-9_.:-]{16,128}$/)
    expect((screen.getByLabelText('Email address') as HTMLInputElement).value).toBe('')
    expect(document.activeElement === screen.getByLabelText('Email address')).toBe(true)
    expect(
      portal.calls.filter((call) => call.method === 'GET' && call.path === INVITATIONS).length
    ).toBeGreaterThan(1)
  })

  test('an Admin can offer only Manager and Rep', async () => {
    visit('admin', empty)
    const select = await screen.findByLabelText('Role offered')
    expect([...select.querySelectorAll('option')].map((option) => option.textContent)).toEqual([
      'Manager',
      'Rep',
    ])
  })

  test('a double click, an Enter and a second click send one request', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const portal = visit(
      'owner',
      route('POST', INVITATIONS, async () => {
        await gate
        return created()
      }),
      empty
    )
    await portal.user.type(await screen.findByLabelText('Email address'), 'new@northline.app')
    const button = screen.getByRole('button', { name: 'Send Invitation' })
    await portal.user.dblClick(button)
    await portal.user.click(button)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Sending...' }).getAttribute('aria-disabled')).toBe(
        'true'
      )
    )
    release()
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Invitation sent.'))
    expect(portal.calls.filter((call) => call.method === 'POST')).toHaveLength(1)
  })

  test('a retry after a network failure reuses the key; after success the next Invitation gets a new one', async () => {
    let attempts = 0
    const portal = visit(
      'owner',
      route('POST', INVITATIONS, () => {
        attempts += 1
        if (attempts === 1) {
          throw new TypeError('network down')
        }
        return created(attempts)
      }),
      empty
    )
    await invite(portal)
    expect((await screen.findByRole('alert')).textContent).toContain('Could not reach Closeline')
    expect((screen.getByLabelText('Email address') as HTMLInputElement).value).toBe(
      'new@northline.app'
    )
    await portal.user.click(screen.getByRole('button', { name: 'Send Invitation' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Invitation sent.'))
    await portal.user.type(screen.getByLabelText('Email address'), 'next@northline.app')
    await portal.user.click(screen.getByRole('button', { name: 'Send Invitation' }))
    await waitFor(() =>
      expect(portal.calls.filter((call) => call.method === 'POST')).toHaveLength(3)
    )
    const keys = portal.calls
      .filter((call) => call.method === 'POST')
      .map((call) => call.headers.get('idempotency-key'))
    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).not.toBe(keys[1])
  })

  test('changing the address between tries never sends the old key with a new body', async () => {
    let attempts = 0
    const portal = visit(
      'owner',
      route('POST', INVITATIONS, () => {
        attempts += 1
        return attempts === 1 ? failure(503, ERRORS['server.unavailable'].code) : created()
      }),
      empty
    )
    await invite(portal, 'one@northline.app')
    await screen.findByRole('alert')
    await portal.user.clear(screen.getByLabelText('Email address'))
    await portal.user.type(screen.getByLabelText('Email address'), 'two@northline.app')
    await portal.user.click(screen.getByRole('button', { name: 'Send Invitation' }))
    await waitFor(() => expect(attempts).toBe(2))
    const keys = portal.calls
      .filter((call) => call.method === 'POST')
      .map((call) => call.headers.get('idempotency-key'))
    expect(keys[0]).not.toBe(keys[1])
  })

  test('an invalid address is named beside the field and focused, and nothing is sent', async () => {
    const portal = visit('owner', empty)
    await invite(portal, 'not-an-address')
    const field = screen.getByLabelText('Email address')
    expect(field.getAttribute('aria-invalid')).toBe('true')
    await waitFor(() => expect(document.activeElement === field).toBe(true))
    expect(
      document.getElementById(field.getAttribute('aria-describedby') ?? '')?.textContent
    ).toContain('Enter a valid email address.')
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
  })

  const refusals: [string, number, string, string, Record<string, unknown> | undefined][] = [
    [
      CORE_ERRORS['invitation.already_pending'].code,
      409,
      'This address already has a pending Invitation. Revoke it to send a new one.',
      'field',
      undefined,
    ],
    [
      ERRORS['rate.limited'].code,
      429,
      'Revoke any you no longer need, or wait. Try again in 5 minutes.',
      'banner',
      { retryAfter: 300 },
    ],
    [
      ERRORS['request.invalid'].code,
      400,
      'Check the details you entered and try again.',
      'banner',
      undefined,
    ],
    [ERRORS['auth.forbidden'].code, 403, 'Your role does not allow this.', 'banner', undefined],
    [ERRORS['server.unavailable'].code, 503, 'the email could not be sent', 'banner', undefined],
    [
      CORE_ERRORS['organization.suspended'].code,
      403,
      'Your Organization is suspended',
      'banner',
      undefined,
    ],
    [
      ERRORS['request.idempotency_key_reused'].code,
      422,
      'Reload the page and try again.',
      'banner',
      undefined,
    ],
  ]
  test.each(refusals)('%s is explained', async (code, status, words, where, details) => {
    const portal = visit('owner', route('POST', INVITATIONS, failure(status, code, details)), empty)
    await invite(portal)
    const alert = where === 'banner' ? await screen.findByRole('alert') : null
    if (alert) {
      expect(alert.textContent).toContain(words)
      await waitFor(() => expect(document.activeElement === alert).toBe(true))
    } else {
      await waitFor(() => {
        const field = screen.getByLabelText('Email address')
        expect(
          document.getElementById(field.getAttribute('aria-describedby') ?? '')?.textContent
        ).toContain(words)
        expect(document.activeElement === field).toBe(true)
      })
    }
    // Never says "user", "account" or "invite link".
    expect(document.body.textContent).not.toMatch(/\b(invite link|account)\b/i)
  })

  test('a 5xx is reported', async () => {
    const portal = visit(
      'owner',
      route('POST', INVITATIONS, failure(500, ERRORS['server.internal'].code)),
      empty
    )
    await invite(portal)
    await screen.findByRole('alert')
    expect(portal.reports).toHaveLength(1)
  })

  test('a 4xx is not reported', async () => {
    const quiet = visit(
      'owner',
      route('POST', INVITATIONS, failure(409, CORE_ERRORS['invitation.already_pending'].code)),
      empty
    )
    await invite(quiet, 'x@northline.app')
    expect(await screen.findByText(/already has a pending Invitation/)).toBeTruthy()
    expect(quiet.reports).toEqual([])
  })
})

describe('Invitations: revoking', () => {
  const list = route(
    'GET',
    INVITATIONS,
    json(200, page([invitationBody(1, { role: 'rep' }), invitationBody(2, { role: 'admin' })]))
  )

  test('asks first, then revokes once, announces it and refetches', async () => {
    let revoked = false
    const portal = visit(
      'owner',
      route('DELETE', `${INVITATIONS}/${hexId('inv', 1)}`, () => {
        revoked = true
        return new Response(null, { status: 204 })
      }),
      route('GET', INVITATIONS, () =>
        json(
          200,
          page(
            revoked
              ? [invitationBody(2, { role: 'admin' })]
              : [invitationBody(1), invitationBody(2, { role: 'admin' })]
          )
        )
      )
    )
    await screen.findByText('invitee1@northline.app')
    await portal.user.click(
      screen.getByRole('button', { name: 'Revoke the Invitation for invitee1@northline.app' })
    )
    expect(document.activeElement === screen.getByRole('button', { name: 'Cancel' })).toBe(true)
    await portal.user.click(screen.getByRole('button', { name: 'Revoke Invitation' }))
    await waitUntilGone('invitee1@northline.app')
    expect(screen.getByRole('status').textContent).toBe('Invitation revoked.')
    expect(portal.calls.filter((call) => call.method === 'DELETE')).toHaveLength(1)
  })

  test('an Admin has no Revoke on an Invitation offering Admin', async () => {
    visit('admin', list)
    await screen.findByText('invitee1@northline.app')
    expect(screen.getByRole('button', { name: /Revoke the Invitation for invitee1/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Revoke the Invitation for invitee2/ })).toBeNull()
    expect(screen.getByText('Only an Owner can revoke this one.')).toBeTruthy()
  })

  test('an Invitation that is no longer pending is explained beside the control', async () => {
    const portal = visit(
      'owner',
      route(
        'DELETE',
        `${INVITATIONS}/${hexId('inv', 1)}`,
        failure(404, CORE_ERRORS['invitation.not_found'].code)
      ),
      list
    )
    await screen.findByText('invitee1@northline.app')
    await portal.user.click(
      screen.getByRole('button', { name: /Revoke the Invitation for invitee1/ })
    )
    await portal.user.click(screen.getByRole('button', { name: 'Revoke Invitation' }))
    expect((await screen.findByRole('alert')).textContent).toContain('no longer pending')
  })

  test('a 403 on revoke is explained', async () => {
    const portal = visit(
      'owner',
      route(
        'DELETE',
        `${INVITATIONS}/${hexId('inv', 1)}`,
        failure(403, ERRORS['auth.forbidden'].code)
      ),
      list
    )
    await screen.findByText('invitee1@northline.app')
    await portal.user.click(
      screen.getByRole('button', { name: /Revoke the Invitation for invitee1/ })
    )
    await portal.user.click(screen.getByRole('button', { name: 'Revoke Invitation' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Your role does not allow this'
    )
  })
})

describe('Invitations: an expired access token', () => {
  test('a 401 goes through the session refresh, and the retried send carries the same idempotency key and the new token', async () => {
    let attempts = 0
    const portal = visit(
      'owner',
      route('POST', INVITATIONS, () => {
        attempts += 1
        return attempts === 1 ? failure(401, ERRORS['auth.token_expired'].code) : created()
      }),
      route(
        'POST',
        '/v1/client/sessions/refresh',
        json(200, tokens({ accessToken: 'access-2', organization: { id: 'org_1', role: 'owner' } }))
      ),
      empty
    )
    await invite(portal)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Invitation sent.'))
    const posts = portal.calls.filter((call) => call.method === 'POST' && call.path === INVITATIONS)
    expect(posts).toHaveLength(2)
    expect(posts[0]?.headers.get('idempotency-key')).toBe(posts[1]?.headers.get('idempotency-key'))
    expect(posts[1]?.headers.get('authorization')).toBe('Bearer access-2')
  })

  test('when the refresh is refused the session ends and the person is sent to sign in', async () => {
    const portal = visit(
      'owner',
      route('POST', INVITATIONS, failure(401, ERRORS['auth.token_expired'].code)),
      route(
        'POST',
        '/v1/client/sessions/refresh',
        failure(401, ERRORS['auth.unauthenticated'].code)
      ),
      empty
    )
    await invite(portal)
    await screen.findByRole('heading', { name: 'Sign in' })
    expect(portal.app.session.getSnapshot().status).toBe('signed_out')
  })
})
