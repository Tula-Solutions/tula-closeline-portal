import { describe, expect, spyOn, test } from 'bun:test'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ERRORS } from 'tula-closeline-contract'
import { createApp } from '~/app'
import { AppContext } from '~/app-context'
import { ErrorBoundary } from '~/ErrorBoundary'
import { createReporter } from '~/report/reporter'
import { failure, fakeFetch, json, route, TEST_ENV, tokens } from '~/testing/fixtures'
import { organizationBody, renderPortal } from '~/testing/render'

const SIGN_OUT = '/v1/client/sessions/sign-out'
const REFRESH = '/v1/client/sessions/refresh'

describe('who can see what', () => {
  test('a visitor who is not signed in is sent from the dashboard to sign-in', async () => {
    renderPortal({ url: '/' })
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
  })

  test('a signed-in person is sent from sign-in and sign-up to the dashboard', async () => {
    renderPortal({ url: '/sign-in', signedIn: true })
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()
    renderPortal({ url: '/sign-up', signedIn: true })
    expect((await screen.findAllByRole('heading', { name: 'Home' })).length).toBeGreaterThan(0)
  })

  test('an address with no page shows the not-found page with a way home', async () => {
    renderPortal({ url: '/nowhere/at/all' })
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Go to the home page' }).getAttribute('href')).toBe('/')
  })
})

describe('the signed-in shell', () => {
  test('shows the logo, the Organization name, the role, a sign-out control and the home page', async () => {
    renderPortal({ url: '/', signedIn: tokens({ organization: { id: 'org_1', role: 'manager' } }) })
    expect(await screen.findByText('Northline')).toBeTruthy()
    expect(screen.getByText('Manager')).toBeTruthy()
    // Once in the sidebar and once in the phone's top bar (each hidden at the other width).
    expect(screen.getAllByRole('img', { name: 'Tula Solution' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe('#main')
    expect(screen.getByRole('heading', { name: 'Home' })).toBeTruthy()
  })

  test('an Organization name is shown as text, never as markup', async () => {
    const name = '<img src=x onerror=alert(1)> Evil'
    const portal = renderPortal({
      url: '/',
      signedIn: true,
      handlers: [route('GET', '/v1/organization', json(200, organizationBody(name)))],
    })
    expect(await screen.findByText(name)).toBeTruthy()
    expect(document.querySelector('img[src="x"]')).toBeNull()
    expect(portal.reports).toEqual([])
  })

  test('while the name is unknown, or core cannot answer, a plain label stands in and a 5xx is reported', async () => {
    const portal = renderPortal({
      url: '/',
      signedIn: true,
      handlers: [route('GET', '/v1/organization', failure(500, 'server.internal'))],
    })
    expect(await screen.findByText('Your Organization')).toBeTruthy()
    await waitFor(() => expect(portal.reports).toHaveLength(1))
    expect(screen.getByText('Your Organization')).toBeTruthy()
  })

  test('the Organization is read with the access token, and an expired one is refreshed once', async () => {
    const portal = renderPortal({
      url: '/',
      signedIn: true,
      handlers: [
        route('GET', '/v1/organization', (call) =>
          call.headers.get('authorization') === 'Bearer access-1'
            ? failure(401, ERRORS['auth.token_expired'].code)
            : json(200, organizationBody('Northline'))
        ),
        route('POST', REFRESH, json(200, tokens({ accessToken: 'access-2' }))),
      ],
    })
    expect(await screen.findByText('Northline')).toBeTruthy()
    expect(portal.calls.filter((call) => call.path === REFRESH)).toHaveLength(1)
    // The refresh carries no body: the refresh token is a cookie the browser sends on its own.
    expect(portal.calls.find((call) => call.path === REFRESH)?.body).toBeUndefined()
    expect(portal.app.session.getSnapshot().status).toBe('signed_in')
  })

  test('a 401 that a refresh does not fix signs the person out and says the session ended', async () => {
    const portal = renderPortal({
      url: '/',
      signedIn: true,
      handlers: [
        route('GET', '/v1/organization', failure(401, ERRORS['auth.token_invalid'].code)),
        route('POST', REFRESH, json(200, tokens({ accessToken: 'access-2' }))),
      ],
    })
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect((await screen.findByRole('status')).textContent).toContain('Your session has ended.')
    expect(portal.reports).toEqual([])
  })

  test('signing out ends the session at the service, forgets what was loaded, and returns to sign-in', async () => {
    const portal = renderPortal({
      url: '/',
      signedIn: true,
      handlers: [route('POST', SIGN_OUT, new Response(null, { status: 204 }))],
    })
    await screen.findByText('Northline')
    expect(portal.app.queryClient.getQueryData(['organization', 'org_1'])).toBeDefined()
    await portal.user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(portal.calls.find((call) => call.path === SIGN_OUT)?.body).toBeUndefined()
    expect(portal.app.queryClient.getQueryData(['organization', 'org_1'])).toBeUndefined()
    expect(portal.app.session.getSnapshot()).toEqual({ status: 'signed_out', ended: false })
    expect(screen.queryByText('Your session has ended. Sign in again.')).toBeNull()
  })

  test('signing out works when the service cannot be reached', async () => {
    const portal = renderPortal({
      url: '/',
      signedIn: true,
      handlers: [
        route('POST', SIGN_OUT, () => {
          throw new TypeError('offline')
        }),
      ],
    })
    await screen.findByText('Northline')
    await portal.user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
  })
})

describe('the error boundary', () => {
  function Crash(): never {
    throw new TypeError('render failed')
  }

  test('shows a plain page and reports the crash once', async () => {
    const reports: Error[] = []
    const double = fakeFetch()
    const app = createApp({
      env: TEST_ENV,
      reporter: createReporter((error) => reports.push(error)),
      fetch: double.fetch,
    })
    // React logs the caught error; keep the test output clean.
    const logged = spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(
        <AppContext.Provider value={app}>
          <ErrorBoundary>
            <Crash />
          </ErrorBoundary>
        </AppContext.Provider>
      )
      expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeTruthy()
    } finally {
      logged.mockRestore()
    }
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
    expect(reports.map((error) => error.message)).toEqual(['render failed'])
  })
})

describe('a session started over a live one', () => {
  test("clears the first person's cached data before the second begins", async () => {
    const portal = renderPortal({
      url: '/',
      signedIn: tokens({ accessToken: 'access-A', organization: { id: 'org_A', role: 'owner' } }),
      handlers: [route('GET', '/v1/organization', json(200, organizationBody('A Corp')))],
    })
    expect(await screen.findByText('A Corp')).toBeTruthy()
    expect(portal.app.queryClient.getQueryData(['organization', 'org_A'])).toBeDefined()
    act(() => {
      portal.app.session.start(
        tokens({ accessToken: 'access-B', organization: { id: 'org_B', role: 'rep' } })
      )
    })
    expect(
      JSON.stringify(
        portal.app.queryClient
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data)
      )
    ).not.toContain('A Corp')
  })

  test('does not bounce the person through the sign-in page', async () => {
    const portal = renderPortal({ url: '/', signedIn: true })
    await screen.findByRole('heading', { name: 'Home' })
    const paths: string[] = []
    const stop = portal.router.subscribe('onResolved', (event) => {
      paths.push(event.toLocation.pathname)
    })
    act(() => {
      portal.app.session.start(
        tokens({ accessToken: 'access-B', organization: { id: 'org_B', role: 'rep' } })
      )
    })
    await screen.findByRole('heading', { name: 'Home' })
    stop()
    expect(paths).not.toContain('/sign-in')
    expect(screen.getByText('Rep')).toBeTruthy()
  })
})

describe('the navigation drawer on a narrow screen', () => {
  test('opening it moves focus into the menu, Escape returns it to the toggle, and a page change lands on the page', async () => {
    const user = userEvent.setup()
    renderPortal({ url: '/', signedIn: true })
    const toggle = await screen.findByRole('button', { name: 'Navigation menu' })
    await user.click(toggle)
    const sidebar = document.getElementById('app-sidebar')
    await waitFor(() => expect(sidebar?.contains(document.activeElement)).toBe(true))
    // It is modal: the page behind it is inert and Tab wraps inside it.
    const main = document.getElementById('main')
    expect(
      main?.hasAttribute('inert') || (main as HTMLElement & { inert?: boolean }).inert === true
    ).toBe(true)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    screen.getByRole('button', { name: 'Sign out' }).focus()
    await user.tab()
    expect(sidebar?.contains(document.activeElement)).toBe(true)
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Sign out' }))
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Navigation menu' }))
    )
    await user.click(screen.getByRole('button', { name: 'Navigation menu' }))
    await user.click(screen.getByRole('link', { name: 'Teams' }))
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('main')))
  })
})

describe('a field error', () => {
  test('keeps its visible "Error:" prefix', async () => {
    const user = userEvent.setup()
    renderPortal({ url: '/sign-in' })
    await user.click(await screen.findByRole('button', { name: 'Sign in' }))
    const prefix = (await screen.findAllByText('Error:'))[0]
    expect(prefix?.className ?? '').not.toContain('sr-only')
  })
})

describe('the drawer when the screen grows', () => {
  test('growing to a wide screen closes it so the page is not left inert', async () => {
    const listeners: ((event: { matches: boolean }) => void)[] = []
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
        listeners.push(listener),
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia
    try {
      const user = userEvent.setup()
      renderPortal({ url: '/', signedIn: true })
      await user.click(await screen.findByRole('button', { name: 'Navigation menu' }))
      const main = document.getElementById('main')
      expect(main?.hasAttribute('inert')).toBe(true)
      act(() => {
        for (const listener of listeners) {
          listener({ matches: true })
        }
      })
      await waitFor(() => expect(main?.hasAttribute('inert')).toBe(false))
    } finally {
      window.matchMedia = original
    }
  })
})
