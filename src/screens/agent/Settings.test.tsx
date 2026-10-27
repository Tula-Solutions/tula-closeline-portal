import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { hexId } from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const SETTINGS = '/v1/agent/settings'
const day = (name: string) => ({ day: name, windows: [{ start: '09:00', end: '17:00' }] })
const settings = (extra: Record<string, unknown> = {}) => ({
  paused: false,
  greeting: 'Thanks for calling Northline.',
  voiceStyle: 'warm',
  timeZone: 'Europe/London',
  hours: [day('mon'), day('tue')],
  maxCallSeconds: 600,
  maxCostUsdCents: 200,
  concurrencyCap: 5,
  languages: ['en'],
  updatedAt: '2026-10-01T10:00:00.000Z',
  updatedByMembershipId: hexId('mem', 1),
  ...extra,
})
const empty = json(200, { items: [], nextCursor: null })
const quiet: Handler[] = [
  route('GET', '/v1/agent/questions', empty),
  route('GET', '/v1/agent-controls', empty),
  route(
    'GET',
    '/v1/agent-controls/organization-pause',
    json(200, { paused: false, updatedAt: null, updatedByMembershipId: null })
  ),
  route('GET', '/v1/agent-instructions/inbound/versions', empty),
]
const read = route('GET', SETTINGS, json(200, settings()))

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', ...handlers: Handler[]) {
  return renderPortal({
    url: '/agent',
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers: [...handlers, ...quiet],
  })
}

afterEach(() => {
  document.documentElement.classList.remove('dark')
  cleanup()
})

describe('Agent settings: who can use them', () => {
  test('a Rep sends no request', async () => {
    const portal = visit('rep', read)
    await screen.findByText(/Only an Owner, Admin or Manager/)
    expect(portal.calls.filter((call) => call.path === SETTINGS)).toHaveLength(0)
  })

  test('a Manager reads the settings and has no way to change them', async () => {
    const portal = visit('manager', read)
    expect(await screen.findByText('Thanks for calling Northline.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit settings' })).toBeNull()
    expect(portal.calls.every((call) => call.method === 'GET')).toBe(true)
  })

  test('there is no setting for the AI and recording disclosure', async () => {
    visit('admin', read)
    await screen.findByText('Thanks for calling Northline.')
    expect(screen.queryByRole('checkbox', { name: /disclos|record|consent/i })).toBeNull()
  })
})

describe('Agent settings: saving', () => {
  test('an Admin saves every field with an idempotency key', async () => {
    const portal = visit('admin', route('PUT', SETTINGS, json(200, settings())), read)
    await screen.findByText('Thanks for calling Northline.')
    await portal.user.click(screen.getByRole('button', { name: 'Edit settings' }))
    const greeting = screen.getByLabelText('Greeting')
    await portal.user.clear(greeting)
    await portal.user.type(greeting, 'Hello from Northline.')
    await portal.user.click(screen.getByLabelText('Voice style'))
    await portal.user.click(await screen.findByRole('option', { name: 'Crisp' }))
    fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'Europe/Paris' } })
    fireEvent.change(screen.getByLabelText('Longest call (seconds)'), { target: { value: '300' } })
    fireEvent.change(screen.getByLabelText('Most one call may cost (US cents)'), {
      target: { value: '150' },
    })
    fireEvent.change(screen.getByLabelText('Calls at once'), { target: { value: '7' } })
    fireEvent.change(screen.getByLabelText('Monday from'), { target: { value: '10:00' } })
    fireEvent.change(screen.getByLabelText('Monday until'), { target: { value: '16:30' } })
    await portal.user.click(screen.getByRole('checkbox', { name: 'Tuesday' }))
    await portal.user.click(screen.getByRole('checkbox', { name: 'Friday' }))
    await portal.user.click(screen.getByRole('checkbox', { name: /Stop answering calls/ }))
    await portal.user.click(screen.getByRole('button', { name: 'Save settings' }))
    await screen.findByText('Settings saved.')
    const put = portal.calls.find((call) => call.method === 'PUT' && call.path === SETTINGS)
    expect(put?.body).toEqual({
      paused: true,
      greeting: 'Hello from Northline.',
      voiceStyle: 'crisp',
      timeZone: 'Europe/Paris',
      hours: [{ day: 'mon', windows: [{ start: '10:00', end: '16:30' }] }, day('fri')],
      maxCallSeconds: 300,
      maxCostUsdCents: 150,
      concurrencyCap: 7,
    })
    expect(put?.headers.get('idempotency-key')).toBeTruthy()
  })

  test('refuses hours outside the calling window before anything is sent', async () => {
    const portal = visit('owner', route('PUT', SETTINGS, json(200, settings())), read)
    await screen.findByText('Thanks for calling Northline.')
    await portal.user.click(screen.getByRole('button', { name: 'Edit settings' }))
    const from = screen.getByLabelText('Monday from')
    fireEvent.change(from, { target: { value: '06:00' } })
    await portal.user.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByText(/^Check the settings/)).toBeTruthy()
    expect(portal.calls.some((call) => call.method === 'PUT')).toBe(false)
  })

  test('asks for a day when every day is unticked, and sends nothing', async () => {
    const portal = visit('owner', route('PUT', SETTINGS, json(200, settings())), read)
    await screen.findByText('Thanks for calling Northline.')
    await portal.user.click(screen.getByRole('button', { name: 'Edit settings' }))
    await portal.user.click(screen.getByRole('checkbox', { name: 'Monday' }))
    await portal.user.click(screen.getByRole('checkbox', { name: 'Tuesday' }))
    await portal.user.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByText(/Choose at least one day/)).toBeTruthy()
    expect(portal.calls.some((call) => call.method === 'PUT')).toBe(false)
  })

  test('refuses a longest call under 30 seconds', async () => {
    const portal = visit('owner', route('PUT', SETTINGS, json(200, settings())), read)
    await screen.findByText('Thanks for calling Northline.')
    await portal.user.click(screen.getByRole('button', { name: 'Edit settings' }))
    fireEvent.change(screen.getByLabelText('Longest call (seconds)'), { target: { value: '29' } })
    await portal.user.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByText(/^Check the settings/)).toBeTruthy()
    expect(portal.calls.some((call) => call.method === 'PUT')).toBe(false)
  })

  test('shows the code text when the API refuses the settings', async () => {
    const portal = visit(
      'owner',
      route('PUT', SETTINGS, failure(422, 'agent.settings_invalid')),
      read
    )
    await screen.findByText('Thanks for calling Northline.')
    await portal.user.click(screen.getByRole('button', { name: 'Edit settings' }))
    await portal.user.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByText(/Those settings are not allowed/)).toBeTruthy()
  })
})

describe('Agent settings: accessibility', () => {
  test.each(['light', 'dark'] as const)('passes axe in %s with the form open', async (theme) => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    }
    const portal = visit('owner', read)
    await screen.findByText('Thanks for calling Northline.')
    await portal.user.click(screen.getByRole('button', { name: 'Edit settings' }))
    await waitFor(() => expect(screen.getByLabelText('Greeting')).toBeTruthy())
    const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
    expect(result.violations.map((violation) => violation.id)).toEqual([])
  })
})
