import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { parseEnv } from '~/env'
import { hexId } from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const CONNECTION = '/v1/calendar-connection'
const HOURS = '/v1/availability'
const NOW = '2026-10-01T10:00:00.000Z'
const STAGING = parseEnv({
  VITE_ENVIRONMENT: 'staging',
  VITE_SENTRY_DSN: 'https://public@sentry.example/1',
})

const connection = (state: 'healthy' | 'needs_reconnect') => ({
  membershipId: hexId('mem', 1),
  provider: 'google',
  state,
  connectedAt: NOW,
  lastCheckedAt: state === 'healthy' ? NOW : null,
})
const availability = {
  timeZone: 'Europe/London',
  hours: [{ day: 'mon', windows: [{ start: '09:00', end: '17:00' }] }],
  dailyCap: 5,
  awayUntil: null,
}
const notConnected = route('GET', CONNECTION, failure(404, 'calendar.not_connected'))
const healthy = route('GET', CONNECTION, json(200, connection('healthy')))
const hours = route('GET', HOURS, json(200, availability))

function visit(
  role: 'owner' | 'admin' | 'manager' | 'rep',
  url: string,
  handlers: Handler[],
  more: { assign?: (url: string) => void; staging?: boolean } = {}
) {
  return renderPortal({
    url,
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers,
    ...(more.assign ? { assign: more.assign } : {}),
    ...(more.staging ? { env: STAGING } : {}),
  })
}

afterEach(() => {
  document.documentElement.classList.remove('dark')
  cleanup()
})

describe('Calendar: who can open it', () => {
  for (const role of ['owner', 'admin', 'manager', 'rep'] as const) {
    test(`a ${role} reaches the page and the nav link`, async () => {
      visit(role, '/calendar', [healthy, hours])
      expect(await screen.findByText('Healthy')).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Calendar' })).toBeTruthy()
    })
  }
})

describe('Calendar: connection', () => {
  test('with no connection it says so, and No calendar is not an error', async () => {
    visit('rep', '/calendar', [notConnected, hours])
    expect(await screen.findByText('Not connected')).toBeTruthy()
    expect(screen.queryByText(/No calendar is connected\./)).toBeNull()
    expect(screen.getByRole('button', { name: 'Connect Google Calendar' })).toBeTruthy()
  })

  test('Connect goes to the consent address, then the return completes and clears the address', async () => {
    const assigned: string[] = []
    let connected = false
    const portal = visit(
      'rep',
      '/calendar',
      [
        route(
          'POST',
          `${CONNECTION}/start`,
          json(200, {
            authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1',
            state: 'st-1',
          })
        ),
        route('POST', `${CONNECTION}/complete`, () => {
          connected = true
          return json(200, connection('healthy'))
        }),
        (call) =>
          call.method === 'GET' && call.path === CONNECTION
            ? connected
              ? json(200, connection('healthy'))
              : failure(404, 'calendar.not_connected')
            : null,
        hours,
      ],
      { assign: (url) => assigned.push(url), staging: true }
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Connect Google Calendar' }))
    await waitFor(() =>
      expect(assigned).toEqual(['https://accounts.google.com/o/oauth2/v2/auth?x=1'])
    )
    cleanup()

    const back = visit(
      'rep',
      '/calendar/callback?code=SECRET-CODE&state=st-1',
      [
        route('POST', `${CONNECTION}/complete`, () => {
          connected = true
          return json(200, connection('healthy'))
        }),
        (call) =>
          call.method === 'GET' && call.path === CONNECTION
            ? connected
              ? json(200, connection('healthy'))
              : failure(404, 'calendar.not_connected')
            : null,
        hours,
      ],
      { staging: true }
    )
    expect(await screen.findByText('Healthy')).toBeTruthy()
    expect(await screen.findByText('Your calendar is connected.')).toBeTruthy()
    const post = back.calls.find((call) => call.path.endsWith('/complete'))
    expect(post?.body).toEqual({ state: 'st-1', code: 'SECRET-CODE' })
    expect(back.router.state.location.href).toBe('/calendar/callback')
  })

  test('the time inputs are wide enough to show a full 12-hour value on a phone', async () => {
    visit('rep', '/calendar', [notConnected, hours])
    const from = await screen.findByLabelText('Monday window 1 from')
    expect(from.className).toContain('w-36')
  })

  test('the code and state leave the address before the call is answered', async () => {
    const portal = visit(
      'rep',
      '/calendar/callback?code=SECRET-CODE&state=st-1',
      [
        route('POST', `${CONNECTION}/complete`, () => new Promise<Response>(() => {})),
        notConnected,
        hours,
      ],
      { staging: true }
    )
    await waitFor(() => expect(portal.router.state.location.search).toEqual({}))
  })

  test('a return that Google refused shows the authorization text and sends nothing', async () => {
    const portal = visit('rep', '/calendar/callback?error=access_denied', [notConnected, hours], {
      staging: true,
    })
    expect(
      await screen.findByText('The calendar could not be connected. Start again.')
    ).toBeTruthy()
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
    await waitFor(() => expect(portal.router.state.location.search).toEqual({}))
  })

  test('a refused completion shows the contract text for its code', async () => {
    visit(
      'rep',
      '/calendar/callback?code=c&state=s',
      [
        route('POST', `${CONNECTION}/complete`, failure(422, 'calendar.authorization_failed')),
        notConnected,
        hours,
      ],
      { staging: true }
    )
    expect(
      await screen.findByText('The calendar could not be connected. Start again.')
    ).toBeTruthy()
  })

  test('a consent address that is not https is never opened', async () => {
    const assigned: string[] = []
    const portal = visit(
      'rep',
      '/calendar',
      [
        route(
          'POST',
          `${CONNECTION}/start`,
          json(200, { authorizationUrl: 'javascript:alert(1)', state: 's' })
        ),
        notConnected,
        hours,
      ],
      { assign: (url) => assigned.push(url), staging: true }
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Connect Google Calendar' }))
    expect(
      await screen.findByText('The calendar could not be connected. Start again.')
    ).toBeTruthy()
    expect(assigned).toEqual([])
  })

  test('a calendar that is not available says so', async () => {
    const portal = visit(
      'rep',
      '/calendar',
      [
        route('POST', `${CONNECTION}/start`, failure(503, 'booking.calendar_unavailable')),
        notConnected,
        hours,
      ],
      { staging: true }
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Connect Google Calendar' }))
    expect(
      await screen.findByText('The calendar is not available right now. Try again shortly.')
    ).toBeTruthy()
  })

  test('a connection that needs reconnecting says so and offers Reconnect', async () => {
    visit('rep', '/calendar', [
      route('GET', CONNECTION, json(200, connection('needs_reconnect'))),
      hours,
    ])
    expect(await screen.findByText('Needs reconnecting')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reconnect Google Calendar' })).toBeTruthy()
    expect(screen.getByText(/not offered for new meetings/)).toBeTruthy()
  })

  test('in the local stack the code can be pasted to finish', async () => {
    let connected = false
    const portal = visit('rep', '/calendar', [
      route(
        'POST',
        `${CONNECTION}/start`,
        json(200, { authorizationUrl: 'https://accounts.google.com/x', state: 'st-9' })
      ),
      route('POST', `${CONNECTION}/complete`, () => {
        connected = true
        return json(200, connection('healthy'))
      }),
      (call) =>
        call.method === 'GET' && call.path === CONNECTION
          ? connected
            ? json(200, connection('healthy'))
            : failure(404, 'calendar.not_connected')
          : null,
      hours,
    ])
    await portal.user.click(await screen.findByRole('button', { name: 'Connect Google Calendar' }))
    await portal.user.type(await screen.findByLabelText('Code from Google'), 'pasted-code')
    await portal.user.click(screen.getByRole('button', { name: 'Finish connecting' }))
    expect(await screen.findByText('Healthy')).toBeTruthy()
    expect(portal.calls.find((call) => call.path.endsWith('/complete'))?.body).toEqual({
      state: 'st-9',
      code: 'pasted-code',
    })
  })

  test('Disconnect asks first, then deletes and shows Not connected', async () => {
    let gone = false
    const portal = visit('rep', '/calendar', [
      route('DELETE', CONNECTION, () => {
        gone = true
        return json(204)
      }),
      (call) =>
        call.method === 'GET' && call.path === CONNECTION
          ? gone
            ? failure(404, 'calendar.not_connected')
            : json(200, connection('healthy'))
          : null,
      hours,
    ])
    await portal.user.click(await screen.findByRole('button', { name: 'Disconnect calendar' }))
    expect(portal.calls.some((call) => call.method === 'DELETE')).toBe(false)
    const buttons = screen.getAllByRole('button', { name: 'Disconnect calendar' })
    await portal.user.click(buttons[buttons.length - 1] as HTMLElement)
    expect(await screen.findByText('Not connected')).toBeTruthy()
  })
})

describe('Calendar: hours', () => {
  test('shows the zone and each day as a ledger, Off where there is no window', async () => {
    visit('rep', '/calendar', [healthy, hours])
    expect(((await screen.findByLabelText('Time zone')) as HTMLInputElement).value).toBe(
      'Europe/London'
    )
    expect((screen.getByLabelText('Monday window 1 from') as HTMLInputElement).value).toBe('09:00')
    expect(screen.getAllByText('Off')).toHaveLength(6)
  })

  test('saves new windows and keeps the daily cap it loaded', async () => {
    const portal = visit('rep', '/calendar', [
      route('PUT', HOURS, json(200, availability)),
      healthy,
      hours,
    ])
    await portal.user.click(await screen.findByRole('button', { name: 'Add Tuesday window' }))
    await portal.user.click(screen.getByRole('button', { name: 'Save hours' }))
    expect(await screen.findByText('Your hours are saved.')).toBeTruthy()
    const put = portal.calls.find((call) => call.method === 'PUT')
    expect(put?.body).toEqual({
      timeZone: 'Europe/London',
      hours: [
        { day: 'mon', windows: [{ start: '09:00', end: '17:00' }] },
        { day: 'tue', windows: [{ start: '09:00', end: '17:00' }] },
      ],
      dailyCap: 5,
      awayUntil: null,
    })
  })

  test('refuses a time zone that does not exist before sending', async () => {
    const portal = visit('rep', '/calendar', [healthy, hours])
    const zone = await screen.findByLabelText('Time zone')
    await portal.user.clear(zone)
    await portal.user.type(zone, 'Mars/Olympus')
    await portal.user.click(screen.getByRole('button', { name: 'Save hours' }))
    expect(await screen.findByText(/Choose a real time zone/)).toBeTruthy()
    expect(portal.calls.some((call) => call.method === 'PUT')).toBe(false)
  })

  test('refuses a window that ends before it starts before sending', async () => {
    const portal = visit('rep', '/calendar', [healthy, hours])
    const end = await screen.findByLabelText('Monday window 1 until')
    portal.user.clear(end)
    await portal.user.type(end, '08:00')
    await portal.user.click(screen.getByRole('button', { name: 'Save hours' }))
    expect(await screen.findByText(/start before its end/)).toBeTruthy()
    expect(portal.calls.some((call) => call.method === 'PUT')).toBe(false)
  })

  test('words calendar.hours_invalid from the contract text', async () => {
    const portal = visit('rep', '/calendar', [
      route('PUT', HOURS, failure(422, 'calendar.hours_invalid')),
      healthy,
      hours,
    ])
    await portal.user.click(await screen.findByRole('button', { name: 'Save hours' }))
    expect(await screen.findByText(/The working hours are not valid\./)).toBeTruthy()
  })

  test('words request.invalid without the service text', async () => {
    const portal = visit('rep', '/calendar', [
      route('PUT', HOURS, failure(422, 'request.invalid')),
      healthy,
      hours,
    ])
    await portal.user.click(await screen.findByRole('button', { name: 'Save hours' }))
    expect(await screen.findByText(/Check the details you entered/)).toBeTruthy()
    expect(screen.queryByText(/Text the portal never shows/)).toBeNull()
  })

  test('removing the only window of a day leaves it Off', async () => {
    const portal = visit('rep', '/calendar', [healthy, hours])
    await portal.user.click(await screen.findByRole('button', { name: 'Remove Monday window 1' }))
    expect(screen.getAllByText('Off')).toHaveLength(7)
  })
})

for (const theme of ['light', 'dark'] as const) {
  describe(`Calendar: accessibility in ${theme}`, () => {
    test('has no axe violations', async () => {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
      }
      visit('rep', '/calendar', [healthy, hours])
      const region = await screen.findByRole('region', { name: 'Hours' })
      await within(region).findByLabelText('Time zone')
      const result = await axe.run(document.body, {
        rules: { 'color-contrast': { enabled: false } },
      })
      expect(result.violations.map((v) => v.id)).toEqual([])
    })
  })
}
