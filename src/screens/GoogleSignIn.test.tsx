import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor } from '@testing-library/react'
import { AUTH_ERRORS } from 'tula-closeline-contract'
import { failure, json, route, tokens } from '~/testing/fixtures'
import { completeBody, renderPortal } from '~/testing/render'

const OPTIONS = '/v1/client/auth-options'
const START = '/v1/client/google/start'
const COMPLETE = '/v1/client/google/complete'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=c&state=s'
const on = route('GET', OPTIONS, json(200, { providers: { google: true } }))
afterEach(cleanup)

const BUTTON = { name: 'Continue with Google' }

describe('the Continue with Google button', () => {
  test('is hidden while Google is off, when the options fail, and when they are unreadable', async () => {
    for (const handler of [
      route('GET', OPTIONS, json(200, { providers: { google: false } })),
      route('GET', OPTIONS, failure(500, 'server.internal')),
      route('GET', OPTIONS, json(200, { providers: 'nonsense' })),
    ]) {
      const { calls } = renderPortal({ url: '/sign-in', handlers: [handler] })
      await screen.findByRole('heading', { name: 'Sign in' })
      await waitFor(() => expect(calls.some((call) => call.path === OPTIONS)).toBe(true))
      expect(screen.queryByRole('button', BUTTON)).toBeNull()
      cleanup()
    }
  })

  test('shows on sign-in and on sign-up when Google is on, with no external image', async () => {
    renderPortal({ url: '/sign-in', handlers: [on] })
    const button = await screen.findByRole('button', BUTTON)
    expect(button.querySelector('svg')).not.toBeNull()
    expect(document.querySelector('img[src*="google"]')).toBeNull()
  })

  test('shows on sign-up too', async () => {
    renderPortal({ url: '/sign-up', handlers: [on] })
    expect(await screen.findByRole('button', BUTTON)).toBeTruthy()
  })

  test('starts the flow with the intent and goes to Google', async () => {
    const assigned: string[] = []
    const portal = renderPortal({
      url: '/sign-in',
      assign: (url) => assigned.push(url),
      handlers: [on, route('POST', START, json(200, { authorizationUrl: AUTH_URL }))],
    })
    await portal.user.click(await screen.findByRole('button', BUTTON))
    await waitFor(() => expect(assigned).toEqual([AUTH_URL]))
    const start = portal.calls.find((call) => call.path === START)
    expect(start?.body).toEqual({ intent: 'sign_in' })
    expect(start?.init.credentials ?? 'same-origin').toBe('same-origin')
  })

  test('sign-up asks for the sign_up intent', async () => {
    const portal = renderPortal({
      url: '/sign-up',
      assign: () => {},
      handlers: [on, route('POST', START, json(200, { authorizationUrl: AUTH_URL }))],
    })
    await portal.user.click(await screen.findByRole('button', BUTTON))
    await waitFor(() => expect(portal.calls.some((call) => call.path === START)).toBe(true))
    expect(portal.calls.find((call) => call.path === START)?.body).toEqual({ intent: 'sign_up' })
  })

  test('refuses an authorization URL that is not on the allow-list and does not leave the page', async () => {
    const assigned: string[] = []
    const portal = renderPortal({
      url: '/sign-in',
      assign: (url) => assigned.push(url),
      handlers: [
        on,
        route(
          'POST',
          START,
          json(200, { authorizationUrl: 'https://accounts.google.com.evil.example/a' })
        ),
      ],
    })
    await portal.user.click(await screen.findByRole('button', BUTTON))
    expect(await screen.findByText(/could not start the sign-in with Google/i)).toBeTruthy()
    expect(assigned).toEqual([])
  })

  test('accepts the local fake issuer only when it is configured', async () => {
    const fake = 'http://127.0.0.1:3015/authorize?state=s'
    const handlers = [on, route('POST', START, json(200, { authorizationUrl: fake }))]
    const refused: string[] = []
    const first = renderPortal({ url: '/sign-in', assign: (url) => refused.push(url), handlers })
    await first.user.click(await screen.findByRole('button', BUTTON))
    await screen.findByText(/could not start the sign-in with Google/i)
    expect(refused).toEqual([])
  })

  test('with the fake issuer configured it goes there', async () => {
    const fake = 'http://127.0.0.1:3015/authorize?state=s'
    const assigned: string[] = []
    const portal = renderPortal({
      url: '/sign-in',
      assign: (url) => assigned.push(url),
      googleFakeIssuerHost: '127.0.0.1:3015',
      handlers: [on, route('POST', START, json(200, { authorizationUrl: fake }))],
    })
    await portal.user.click(await screen.findByRole('button', BUTTON))
    await waitFor(() => expect(assigned).toEqual([fake]))
  })

  test('shows an error and can be tried again when start fails', async () => {
    const portal = renderPortal({
      url: '/sign-in',
      handlers: [
        on,
        route(
          'POST',
          START,
          failure(503, AUTH_ERRORS['oidc.provider_unavailable'].code, undefined, {
            'retry-after': '30',
          })
        ),
      ],
    })
    await portal.user.click(await screen.findByRole('button', BUTTON))
    expect(await screen.findByText(/Google did not answer/)).toBeTruthy()
    expect(screen.getByRole('button', BUTTON)).toBeTruthy()
  })
})

describe('a failed Google sign-in on the sign-in page', () => {
  const MESSAGES = [
    ['oidc.disabled', /not available right now/],
    ['oidc.state_invalid', /expired or was already used/],
    ['oidc.email_unverified', /not verified that email address/],
    ['oidc.provider_unavailable', /Google did not answer/],
    ['oidc.invitation_mismatch', /different email address/],
    ['oidc.access_denied', /cancelled/],
  ] as const

  test.each(MESSAGES)(
    '%s has its own words and the parameter leaves the address',
    async (code, words) => {
      const portal = renderPortal({ url: `/sign-in?error=${code}`, handlers: [on] })
      expect(await screen.findByText(words)).toBeTruthy()
      await waitFor(() => expect(portal.router.state.location.search).not.toHaveProperty('error'))
      expect(portal.router.state.location.searchStr).not.toContain('error')
    }
  )

  test('any other code gets a general message and shows nothing of the code', async () => {
    renderPortal({ url: '/sign-in?error=totally.unknown', handlers: [on] })
    expect(await screen.findByText(/could not sign you in with Google/i)).toBeTruthy()
    expect(document.body.textContent).not.toContain('totally.unknown')
  })

  test('a value that is not a code is ignored quietly', async () => {
    renderPortal({ url: '/sign-in?error=<script>', handlers: [on] })
    await screen.findByRole('heading', { name: 'Sign in' })
    expect(screen.queryByText(/could not sign you in with Google/i)).toBeNull()
  })
})

describe('the Google sign-up step', () => {
  const attempt = 'att_google_1'
  const url = `/sign-up/google?attempt=${attempt}`

  test('asks for an Organization name, completes and starts the session', async () => {
    const portal = renderPortal({
      url,
      handlers: [
        route(
          'POST',
          COMPLETE,
          json(
            200,
            completeBody('sign_up', tokens({ organization: { id: 'org_1', role: 'owner' } }))
          )
        ),
      ],
    })
    await portal.user.type(await screen.findByLabelText('Organization name'), 'Northline')
    await portal.user.click(screen.getByRole('button', { name: 'Create Organization' }))
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()
    const call = portal.calls.find((c) => c.path === COMPLETE)
    expect(call?.body).toEqual({ attemptId: attempt, organizationName: 'Northline' })
    expect(portal.app.session.getSnapshot().status).toBe('signed_in')
    // No token reaches storage or the address.
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
    expect(window.location.href).not.toContain('access-1')
    expect(document.cookie).not.toContain('access-1')
  })

  test('takes the Invitation instead of a name when it came from an Invitation link', async () => {
    const token = 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5'
    const portal = renderPortal({
      url: `${url}#invitation=${token}`,
      handlers: [route('POST', COMPLETE, json(200, completeBody('sign_up')))],
    })
    expect(screen.queryByLabelText('Organization name')).toBeNull()
    await portal.user.click(await screen.findByRole('button', { name: 'Accept Invitation' }))
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()
    expect(portal.calls.find((c) => c.path === COMPLETE)?.body).toEqual({
      attemptId: attempt,
      invitationToken: token,
    })
    expect(window.location.href).not.toContain(token)
  })

  test('a Google account for another address than the Invitation says so and offers a fresh start', async () => {
    const portal = renderPortal({
      url: `${url}#invitation=Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5`,
      handlers: [
        route('POST', COMPLETE, failure(403, AUTH_ERRORS['oidc.invitation_mismatch'].code)),
      ],
    })
    await portal.user.click(await screen.findByRole('button', { name: 'Accept Invitation' }))
    expect(await screen.findByText(/different email address/)).toBeTruthy()
    expect(portal.app.session.getSnapshot().status).not.toBe('signed_in')
  })

  test('an expired or used attempt tells the person to start again', async () => {
    const portal = renderPortal({
      url,
      handlers: [route('POST', COMPLETE, failure(400, AUTH_ERRORS['oidc.state_invalid'].code))],
    })
    await portal.user.type(await screen.findByLabelText('Organization name'), 'Northline')
    await portal.user.click(screen.getByRole('button', { name: 'Create Organization' }))
    expect(await screen.findByText(/expired or was already used/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Start again' }).getAttribute('href')).toBe('/sign-up')
  })

  test('an Organization name the service refuses is shown at the field', async () => {
    const portal = renderPortal({
      url,
      handlers: [
        route('POST', COMPLETE, failure(422, AUTH_ERRORS['signup.organization_name_invalid'].code)),
      ],
    })
    await portal.user.type(await screen.findByLabelText('Organization name'), 'x')
    await portal.user.click(screen.getByRole('button', { name: 'Create Organization' }))
    expect(await screen.findByText('Enter a valid Organization name.')).toBeTruthy()
  })

  test('without a valid attempt in the address it explains and links to sign-up', async () => {
    renderPortal({ url: '/sign-up/google', handlers: [] })
    expect(await screen.findByText(/This Google sign-in cannot continue/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Start again' }).getAttribute('href')).toBe('/sign-up')
  })
})
