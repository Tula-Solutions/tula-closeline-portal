import { describe, expect, setSystemTime, test } from 'bun:test'
import { screen, waitFor, within } from '@testing-library/react'
import { APIKEY_ERRORS, ERRORS } from 'tula-closeline-contract'
import { apiKeyBody, hexId, page, teamBody } from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'
import { choose, optionsOf } from '~/testing/select'

const KEYS = '/v1/api-keys'
const SECRET = `clk_${'Q'.repeat(43)}`

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', url: string, ...handlers: Handler[]) {
  return renderPortal({
    url,
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers,
  })
}

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
}

const keys = route(
  'GET',
  KEYS,
  json(
    200,
    page([
      apiKeyBody(1, { name: 'CRM sync', lastUsedAt: '2026-10-05T10:00:00Z' }),
      apiKeyBody(2, { name: 'Old key', revokedAt: '2026-10-03T00:00:00Z' }),
      apiKeyBody(3, { name: 'Lapsed key', expiresAt: '2026-10-02T00:00:00Z' }),
      apiKeyBody(4, {
        name: 'Forever key',
        expiresAt: null,
        scopes: ['calls:read', 'calls:write'],
      }),
    ])
  )
)

describe('API keys: who may see them', () => {
  test.each(['manager', 'rep'] as const)(
    'a %s sees a notice, no keys, and nothing is requested',
    async (role) => {
      const portal = visit(role, '/api-keys', keys)
      expect(await screen.findByText(/Only an Owner or Admin can manage API keys/)).toBeTruthy()
      expect(screen.queryByRole('list', { name: 'API keys' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Create key' })).toBeNull()
      expect(portal.calls.some((call) => call.path.startsWith(KEYS))).toBe(false)
    }
  )

  test.each(['manager', 'rep'] as const)('the nav link is hidden from a %s', async (role) => {
    visit(role, '/teams', route('GET', '/v1/teams', json(200, page([teamBody(1, 'Northern')]))))
    await screen.findByRole('list', { name: 'Teams' })
    expect(screen.queryByRole('link', { name: 'API keys' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Developers' })).toBeTruthy()
  })

  test.each(['owner', 'admin'] as const)('the nav link is shown to an %s', async (role) => {
    visit(role, '/teams', route('GET', '/v1/teams', json(200, page([teamBody(1, 'Northern')]))))
    await screen.findByRole('list', { name: 'Teams' })
    expect(screen.getByRole('link', { name: 'API keys' })).toBeTruthy()
  })
})

describe('API keys: the list', () => {
  test('shows prefix, created, last used, expiry and status, and never a secret', async () => {
    const portal = visit('admin', '/api-keys', keys)
    const list = await screen.findByRole('list', { name: 'API keys' })
    const crm = within(list).getByText('CRM sync').closest('li') as HTMLElement
    expect(within(crm).getByText(/clk_aaaaaaa1/)).toBeTruthy()
    expect(within(crm).getByText(/Active/)).toBeTruthy()
    expect(within(crm).queryByText('Never used')).toBeNull()
    expect(within(crm).getByText('Created')).toBeTruthy()
    const old = within(list).getByText('Old key').closest('li') as HTMLElement
    expect(within(old).getByText(/Revoked/)).toBeTruthy()
    expect(within(old).queryByRole('button', { name: /Revoke/ })).toBeNull()
    const lapsed = within(list).getByText('Lapsed key').closest('li') as HTMLElement
    expect(within(lapsed).getByText(/Expired/)).toBeTruthy()
    expect(within(lapsed).queryByRole('button', { name: /Revoke/ })).toBeNull()
    const forever = within(list).getByText('Forever key').closest('li') as HTMLElement
    expect(within(forever).getByText('No expiry')).toBeTruthy()
    expect(within(forever).getByText('Never used')).toBeTruthy()
    expect(portal.calls.find((call) => call.path === KEYS)?.url).toContain('includeRevoked=true')
  })

  test('says when there are none', async () => {
    visit('owner', '/api-keys', route('GET', KEYS, json(200, page([]))))
    expect(await screen.findByText('There are no API keys yet.')).toBeTruthy()
  })

  test('a name with markup is shown as isolated text', async () => {
    visit(
      'admin',
      '/api-keys',
      route('GET', KEYS, json(200, page([apiKeyBody(1, { name: '<script>x</script>' })])))
    )
    const name = await screen.findByText('<script>x</script>')
    expect(document.querySelector('main script')).toBeNull()
    expect(name.tagName).toBe('BDI')
  })
})

describe('API keys: create', () => {
  async function fillIn(portal: ReturnType<typeof visit>) {
    await portal.user.type(await screen.findByLabelText('Name'), '  CRM sync  ')
    await portal.user.click(screen.getByRole('checkbox', { name: 'Prospects: read' }))
    await portal.user.click(screen.getByRole('checkbox', { name: 'Calls: write' }))
  }

  test('shows the secret once, in a dialog, and drops it when the dialog closes', async () => {
    const portal = visit(
      'admin',
      '/api-keys',
      route('POST', KEYS, json(201, { ...apiKeyBody(9), secret: SECRET })),
      keys
    )
    await fillIn(portal)
    await portal.user.click(screen.getByRole('button', { name: 'Create key' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByTestId('secret-value').textContent).toBe(SECRET)
    const post = portal.calls.find((call) => call.method === 'POST')
    expect(post?.body).toMatchObject({
      name: 'CRM sync',
      scopes: ['prospects:read', 'calls:write'],
      roleCeiling: 'rep',
    })
    expect(String((post?.body as Record<string, unknown> | undefined)?.expiresAt)).toMatch(
      /^\d{4}-\d\d-\d\dT/
    )
    expect(post?.headers.get('idempotency-key')).toMatch(/^[A-Za-z0-9_.:-]{16,128}$/)
    // The list refetches after the create, and the secret is in no list.
    await waitFor(() =>
      expect(
        portal.calls.filter((call) => call.method === 'GET' && call.path === KEYS).length
      ).toBeGreaterThan(1)
    )
    // The form was cleared.
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('')
    await portal.user.click(within(dialog).getByRole('button', { name: 'I have stored it' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.body.textContent).not.toContain(SECRET)
    expect(document.body.innerHTML).not.toContain(SECRET)
    expect(JSON.stringify({ ...window.localStorage, ...window.sessionStorage })).not.toContain(
      SECRET
    )
    expect(window.location.href).not.toContain(SECRET)
  })

  test('the Copy button writes the secret to the clipboard and says so', async () => {
    const written: string[] = []
    const portal = visit(
      'owner',
      '/api-keys',
      route('POST', KEYS, json(201, { ...apiKeyBody(9), secret: SECRET })),
      keys
    )
    // userEvent.setup() installs its own clipboard, so the stand-in goes in after the portal is up.
    stubClipboard((text) => {
      written.push(text)
      return Promise.resolve()
    })
    await fillIn(portal)
    await portal.user.click(screen.getByRole('button', { name: 'Create key' }))
    const dialog = await screen.findByRole('dialog')
    await portal.user.click(within(dialog).getByRole('button', { name: 'Copy secret' }))
    await within(dialog).findByText('Copied to the clipboard.')
    expect(written).toEqual([SECRET])
  })

  test('when copying fails it says so and keeps the secret on screen', async () => {
    const portal = visit(
      'owner',
      '/api-keys',
      route('POST', KEYS, json(201, { ...apiKeyBody(9), secret: SECRET })),
      keys
    )
    stubClipboard(() => Promise.reject(new Error('denied')))
    await fillIn(portal)
    await portal.user.click(screen.getByRole('button', { name: 'Create key' }))
    const dialog = await screen.findByRole('dialog')
    await portal.user.click(within(dialog).getByRole('button', { name: 'Copy secret' }))
    await within(dialog).findByText(/Could not copy/)
    expect(within(dialog).getByTestId('secret-value').textContent).toBe(SECRET)
  })

  test('a replay that has no secret is explained, and no dialog opens', async () => {
    const portal = visit(
      'admin',
      '/api-keys',
      route('POST', KEYS, json(200, { ...apiKeyBody(9), secret: null })),
      keys
    )
    await fillIn(portal)
    await portal.user.click(screen.getByRole('button', { name: 'Create key' }))
    expect((await screen.findByRole('alert')).textContent).toContain('cannot be shown again')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('a name and a scope are required before anything is sent', async () => {
    const portal = visit('admin', '/api-keys', keys)
    await portal.user.click(await screen.findByRole('button', { name: 'Create key' }))
    expect(screen.getByLabelText('Name').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText(/Choose at least one scope/)).toBeTruthy()
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
  })

  test('an Admin may choose a ceiling up to Admin and an Owner up to Owner', async () => {
    const admin = visit('admin', '/api-keys', keys)
    const field = await screen.findByLabelText('Role ceiling')
    expect((await optionsOf(admin.user, field)).map((option) => option.value)).toEqual([
      'admin',
      'manager',
      'rep',
    ])
  })

  test('an Owner chooses a ceiling and "No expiry", and both are sent', async () => {
    const portal = visit(
      'owner',
      '/api-keys',
      route('POST', KEYS, json(201, { ...apiKeyBody(9), secret: SECRET })),
      keys
    )
    expect(
      (await optionsOf(portal.user, await screen.findByLabelText('Role ceiling'))).map(
        (option) => option.value
      )
    ).toEqual(['owner', 'admin', 'manager', 'rep'])
    await fillIn(portal)
    await choose(portal.user, screen.getByLabelText('Role ceiling'), 'manager')
    await choose(portal.user, screen.getByLabelText('Expires after'), 'never')
    await portal.user.click(screen.getByRole('button', { name: 'Create key' }))
    await screen.findByRole('dialog')
    expect(portal.calls.find((call) => call.method === 'POST')?.body).toMatchObject({
      roleCeiling: 'manager',
      expiresAt: null,
    })
  })

  test('a role above your own is explained in words', async () => {
    const portal = visit(
      'admin',
      '/api-keys',
      route('POST', KEYS, () => failure(403, APIKEY_ERRORS['apikey.scope_not_allowed'].code)),
      keys
    )
    await fillIn(portal)
    await portal.user.click(screen.getByRole('button', { name: 'Create key' }))
    expect((await screen.findByRole('alert')).textContent).toContain('more access than your own')
  })

  test('a retry after an unknown outcome keeps the key and the body', async () => {
    const portal = visit(
      'admin',
      '/api-keys',
      route('POST', KEYS, () => failure(503, ERRORS['server.unavailable'].code)),
      keys
    )
    await fillIn(portal)
    await portal.user.click(screen.getByRole('button', { name: 'Create key' }))
    await screen.findByRole('alert')
    await portal.user.click(screen.getByRole('button', { name: 'Create key' }))
    await waitFor(() =>
      expect(portal.calls.filter((call) => call.method === 'POST')).toHaveLength(2)
    )
    const [first, second] = portal.calls.filter((call) => call.method === 'POST')
    expect(second?.headers.get('idempotency-key')).toBe(first?.headers.get('idempotency-key') ?? '')
    expect(second?.body).toEqual(first?.body ?? null)
  })

  test('going back to an unfinished create resends its body under its key', async () => {
    let posts = 0
    const portal = visit(
      'admin',
      '/api-keys',
      route('POST', KEYS, () => {
        posts += 1
        return posts === 2
          ? failure(403, APIKEY_ERRORS['apikey.scope_not_allowed'].code)
          : failure(503, ERRORS['server.unavailable'].code)
      }),
      keys
    )
    await fillIn(portal)
    const create = () => portal.user.click(screen.getByRole('button', { name: 'Create key' }))
    await create()
    await waitFor(() => expect(posts).toBe(1))
    await screen.findByRole('alert')
    const name = screen.getByLabelText('Name')
    await portal.user.type(name, 'x')
    setSystemTime(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000))
    try {
      await create()
      await waitFor(() => expect(posts).toBe(2))
      await portal.user.type(name, '{Backspace}')
      await create()
      await waitFor(() => expect(posts).toBe(3))
    } finally {
      setSystemTime()
    }
    const [first, , third] = portal.calls.filter((call) => call.method === 'POST')
    expect(third?.headers.get('idempotency-key')).toBe(first?.headers.get('idempotency-key') ?? '')
    expect(third?.body).toEqual(first?.body ?? null)
  })

  test('a retry after a refused create works out the expiry from the retry', async () => {
    const portal = visit(
      'admin',
      '/api-keys',
      route('POST', KEYS, () => failure(403, APIKEY_ERRORS['apikey.scope_not_allowed'].code)),
      keys
    )
    await fillIn(portal)
    await portal.user.click(screen.getByRole('button', { name: 'Create key' }))
    await screen.findByRole('alert')
    const later = Date.now() + 3 * 24 * 60 * 60 * 1000
    setSystemTime(new Date(later))
    try {
      await portal.user.click(screen.getByRole('button', { name: 'Create key' }))
      await waitFor(() =>
        expect(portal.calls.filter((call) => call.method === 'POST')).toHaveLength(2)
      )
    } finally {
      setSystemTime()
    }
    const [first, second] = portal.calls.filter((call) => call.method === 'POST')
    const expiry = (call: typeof first) =>
      Date.parse(String((call?.body as { expiresAt?: string } | null)?.expiresAt))
    expect(expiry(second) - expiry(first)).toBeGreaterThanOrEqual(2 * 24 * 60 * 60 * 1000)
  })
})

describe('API keys: revoke', () => {
  const revokePath = (n: number) => `${KEYS}/${hexId('akey', n)}/revoke`

  test('asks first, then revokes with an idempotency key and refetches', async () => {
    const portal = visit(
      'admin',
      '/api-keys',
      route('POST', revokePath(1), json(200, apiKeyBody(1, { revokedAt: '2026-10-06T00:00:00Z' }))),
      keys
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Revoke CRM sync' }))
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
    await portal.user.click(screen.getByRole('button', { name: 'Revoke key' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('API key revoked.'))
    const post = portal.calls.find((call) => call.method === 'POST')
    expect(post?.path).toBe(revokePath(1))
    expect(post?.headers.get('idempotency-key')).toMatch(/^[A-Za-z0-9_.:-]{16,128}$/)
  })

  test('cancelling sends nothing', async () => {
    const portal = visit('owner', '/api-keys', keys)
    await portal.user.click(await screen.findByRole('button', { name: 'Revoke CRM sync' }))
    await portal.user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
  })

  test('a key that is already gone is explained in words', async () => {
    const portal = visit(
      'admin',
      '/api-keys',
      route('POST', revokePath(1), () => failure(404, APIKEY_ERRORS['apikey.not_found'].code)),
      keys
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Revoke CRM sync' }))
    await portal.user.click(screen.getByRole('button', { name: 'Revoke key' }))
    expect((await screen.findByRole('alert')).textContent).toContain('no longer exists')
  })
})
