import { describe, expect, test } from 'bun:test'
import { screen, waitFor } from '@testing-library/react'
import { AUTH_ERRORS, ERRORS } from 'tula-closeline-contract'
import { failure, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const REFRESH = '/v1/client/sessions/refresh'

describe('restoring the session on load', () => {
  test('a reload with a live cookie opens the dashboard without the sign-in screen ever showing', async () => {
    const headings: string[] = []
    const watch = new MutationObserver(() => {
      for (const heading of document.querySelectorAll('h1')) {
        headings.push(heading.textContent ?? '')
      }
    })
    watch.observe(document.body, { childList: true, subtree: true })
    const portal = renderPortal({
      url: '/',
      restore: true,
      handlers: [route('POST', REFRESH, json(200, tokens({ accessToken: 'restored' })))],
    })
    // Pending while the refresh is in flight.
    expect(portal.app.session.getSnapshot()).toEqual({ status: 'restoring' })
    expect(screen.getByRole('status').textContent).toContain('Restoring your session')
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull()
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()
    watch.disconnect()
    expect(headings).not.toContain('Sign in')
    expect(portal.calls.filter((call) => call.path === REFRESH)).toHaveLength(1)
    expect(portal.calls.find((call) => call.path === REFRESH)?.body).toBeUndefined()
    expect(await screen.findByText('Northline')).toBeTruthy()
    // The restored access token is what core is called with.
    expect(
      portal.calls.find((call) => call.path === '/v1/organization')?.headers.get('authorization')
    ).toBe('Bearer restored')
  })

  test('a 401 is signed out: the sign-in screen, with no "session ended" notice', async () => {
    const portal = renderPortal({
      url: '/',
      restore: true,
      handlers: [route('POST', REFRESH, failure(401, AUTH_ERRORS['session.invalid_token'].code))],
    })
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(screen.queryByText('Your session has ended. Sign in again.')).toBeNull()
    expect(portal.reports).toEqual([])
  })

  test.each([
    [
      'no answer',
      () => {
        throw new TypeError('offline')
      },
    ],
    ['a 503', () => failure(503, 'server.unavailable')],
    ['a 500', () => failure(500, 'server.internal')],
  ])('%s is "could not reach the service" with a retry, not sign-in', async (_name, answer) => {
    const portal = renderPortal({
      url: '/',
      restore: true,
      handlers: [route('POST', REFRESH, answer)],
    })
    expect(await screen.findByText(/could not reach the service/i)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(portal.app.session.getSnapshot()).toEqual({ status: 'unreachable' })
  })

  test('the retry refreshes again and opens the dashboard when the service is back', async () => {
    let up = false
    const portal = renderPortal({
      url: '/',
      restore: true,
      handlers: [
        route('POST', REFRESH, () =>
          up ? json(200, tokens()) : failure(503, 'server.unavailable')
        ),
      ],
    })
    await screen.findByRole('button', { name: 'Try again' })
    up = true
    await portal.user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()
    expect(portal.calls.filter((call) => call.path === REFRESH)).toHaveLength(2)
  })

  test('the message shown for an unreachable service carries no address or token', async () => {
    renderPortal({
      url: '/',
      restore: true,
      handlers: [route('POST', REFRESH, failure(503, 'server.unavailable'))],
    })
    const message = (await screen.findByRole('alert')).textContent ?? ''
    expect(message).not.toMatch(/@|Bearer|access-|refresh/i)
  })

  test('a deep link survives the restore', async () => {
    renderPortal({
      url: '/',
      restore: true,
      handlers: [route('POST', REFRESH, json(200, tokens()))],
    })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Home' })).toBeTruthy())
  })

  test('a 403 from auth (a deployment mistake) is its own screen: plain copy, no retry, one report of status and code', async () => {
    const portal = renderPortal({
      url: '/',
      restore: true,
      handlers: [route('POST', REFRESH, failure(403, ERRORS['auth.forbidden'].code))],
    })
    const message = await screen.findByRole('alert')
    expect(message.textContent).toContain(
      'This portal is not set up correctly for this address. Reload the page; if this stays, contact support.'
    )
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull()
    expect(portal.app.session.getSnapshot()).toEqual({ status: 'misconfigured' })
    expect(portal.reports.map((error) => error.message)).toEqual([
      'Session restore refused: 403 auth.forbidden',
    ])
    expect(portal.calls.filter((call) => call.path === REFRESH)).toHaveLength(1)
  })

  test('a 429 keeps the retry and reports nothing', async () => {
    const portal = renderPortal({
      url: '/',
      restore: true,
      handlers: [route('POST', REFRESH, failure(429, 'rate.limited'))],
    })
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(portal.app.session.getSnapshot()).toEqual({ status: 'unreachable' })
    expect(portal.reports).toEqual([])
  })
})

describe('a refresh that returns another Organization', () => {
  test('clears the cached data of the first one', async () => {
    const portal = renderPortal({
      url: '/',
      signedIn: tokens({ organization: { id: 'org_A', role: 'owner' } }),
      handlers: [
        route('POST', REFRESH, json(200, tokens({ organization: { id: 'org_B', role: 'rep' } }))),
      ],
    })
    await screen.findByText('Northline')
    expect(portal.app.queryClient.getQueryData(['organization', 'org_A'])).toBeDefined()
    portal.app.queryClient.setQueryData(['other'], 'org A only')
    await portal.app.session.refresh('access-1')
    expect(portal.app.queryClient.getQueryData(['other'])).toBeUndefined()
    expect(portal.app.session.getSnapshot()).toEqual({
      status: 'signed_in',
      organization: { id: 'org_B', role: 'rep' },
    })
  })
})
