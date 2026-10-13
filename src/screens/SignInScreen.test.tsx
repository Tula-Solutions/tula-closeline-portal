import { describe, expect, test } from 'bun:test'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { AUTH_ERRORS } from 'tula-closeline-contract'
import { failure, type Handler, json, route } from '~/testing/fixtures'
import { completeBody, renderPortal, startedBody } from '~/testing/render'

const START = '/v1/client/sign-ins'
const PASSWORD = '/v1/client/sign-ins/att_1/password'

const started = route('POST', START, json(200, startedBody('sign_in', 'needs_password')))
const signedIn = route('POST', PASSWORD, json(200, completeBody('sign_in')))

type Portal = ReturnType<typeof renderPortal>

async function fill(portal: Portal, password = 'correct horse battery') {
  await portal.user.type(await screen.findByLabelText('Email address'), 'Maya@Northline.app')
  await portal.user.type(screen.getByLabelText('Password'), password)
}

async function submit(portal: Portal) {
  await portal.user.click(screen.getByRole('button', { name: 'Sign in' }))
}

function visit(handlers: Handler[]) {
  return renderPortal({ url: '/sign-in', handlers })
}

describe('sign-in', () => {
  test('one form: the email address and password start the sign-in, send the password, and open the dashboard', async () => {
    const portal = visit([started, signedIn])
    await fill(portal)
    await submit(portal)
    await screen.findByRole('heading', { name: 'Home' })
    expect(portal.calls.find((call) => call.path === START)?.body).toEqual({
      identifier: 'maya@northline.app',
    })
    expect(portal.calls.find((call) => call.path === START)?.headers.get('x-tula-client')).toBe(
      'web'
    )
    const password = portal.calls.find((call) => call.path === PASSWORD)
    expect(password?.body).toEqual({ password: 'correct horse battery' })
    expect(password?.headers.get('x-tula-attempt')).toBe('attempt-secret-1')
    expect(await screen.findByText('Northline')).toBeTruthy()
    expect(portal.app.session.getSnapshot().status).toBe('signed_in')
    expect(localStorage.length + sessionStorage.length).toBe(0)
    expect(portal.reports).toEqual([])
  })

  test('works from the keyboard alone', async () => {
    const portal = visit([started, signedIn])
    await portal.user.click(await screen.findByLabelText('Email address'))
    await portal.user.keyboard('maya@northline.app{Tab}correct horse battery{Enter}')
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()
  })

  test('empty fields are named and the first is focused, with nothing sent', async () => {
    const portal = visit([])
    await screen.findByLabelText('Email address')
    await submit(portal)
    const email = screen.getByLabelText('Email address')
    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText('Password').getAttribute('aria-invalid')).toBe('true')
    await waitFor(() => expect(document.activeElement === email).toBe(true))
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
  })

  test('the same words for a wrong address and a wrong password', async () => {
    const portal = visit([
      started,
      route('POST', PASSWORD, failure(401, AUTH_ERRORS['auth.invalid_credentials'].code)),
    ])
    await fill(portal)
    await submit(portal)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('The email address or password is not right.')
    expect(alert.textContent).not.toMatch(/no account|not registered|unknown/i)
    await waitFor(() => expect(document.activeElement === alert).toBe(true))
    expect(portal.app.session.getSnapshot().status).toBe('signed_out')
    expect(portal.reports).toEqual([])
  })

  const failures: [string, string, number, string, Record<string, unknown> | undefined][] = [
    ['start', 'rate.limited', 429, 'Too many tries. Try again in 20 seconds.', { retryAfter: 20 }],
    [
      'password',
      'rate.limited',
      429,
      'Too many tries. Try again in 15 minutes.',
      { retryAfter: 900 },
    ],
    [
      'start',
      'server.unavailable',
      503,
      'Closeline is busy right now. Try again in 1 second.',
      { retryAfter: 1 },
    ],
    [
      'password',
      'server.unavailable',
      503,
      'Closeline is busy right now. Try again shortly.',
      undefined,
    ],
    [
      'password',
      AUTH_ERRORS['membership.unavailable'].code,
      503,
      'We could not set up your place in the Organization right now. Try again in 5 seconds.',
      { retryAfter: 5 },
    ],
    ['password', AUTH_ERRORS['auth.user_banned'].code, 403, 'This sign-in is blocked.', undefined],
    [
      'password',
      AUTH_ERRORS['auth.no_organization'].code,
      403,
      'You do not belong to an Organization, so you cannot sign in.',
      undefined,
    ],
    ['start', 'request.invalid', 400, 'Check the details you entered and try again.', undefined],
    [
      'password',
      AUTH_ERRORS['flow.not_found'].code,
      404,
      'This sign-in has ended. Start again.',
      undefined,
    ],
    [
      'password',
      AUTH_ERRORS['flow.invalid_step'].code,
      409,
      'That step is not available now. Start again.',
      undefined,
    ],
    ['password', 'server.internal', 500, 'Something went wrong on our side. Try again.', undefined],
    ['start', 'server.timeout', 504, 'That took too long. Try again.', undefined],
    [
      'password',
      AUTH_ERRORS['password.too_long'].code,
      422,
      'The email address or password is not right.',
      undefined,
    ],
    [
      'password',
      AUTH_ERRORS['password.common'].code,
      422,
      'The email address or password is not right.',
      undefined,
    ],
  ]

  test.each(failures)(
    'at the %s step, %s is explained',
    async (step, code, status, words, details) => {
      const handlers =
        step === 'start'
          ? [route('POST', START, failure(status, code, details))]
          : [started, route('POST', PASSWORD, failure(status, code, details))]
      const portal = visit(handlers)
      await fill(portal)
      await submit(portal)
      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain(words)
      // The address stays; nothing about the password is explained beyond "not right".
      expect((screen.getByLabelText('Email address') as HTMLInputElement).value).toBe(
        'Maya@Northline.app'
      )
      expect(portal.app.session.getSnapshot().status).toBe('signed_out')
    }
  )

  test('an address the service calls invalid is shown beside the address field', async () => {
    const portal = visit([route('POST', START, failure(422, AUTH_ERRORS['email.invalid'].code))])
    await fill(portal)
    await submit(portal)
    await waitFor(() => {
      const email = screen.getByLabelText('Email address')
      expect(email.getAttribute('aria-invalid')).toBe('true')
      expect(
        document.getElementById(email.getAttribute('aria-describedby') ?? '')?.textContent
      ).toContain('Enter a valid email address.')
    })
  })

  test('only a fault of ours is reported: the 5xx cases are, the 4xx cases are not', async () => {
    const down = visit([started, route('POST', PASSWORD, failure(500, 'server.internal'))])
    await fill(down)
    await submit(down)
    await screen.findByRole('alert')
    expect(down.reports).toHaveLength(1)
    expect(down.reports[0]?.message).toBe('API 500 server.internal')
  })

  test('a sign-in the service cannot finish is not treated as success', async () => {
    const portal = visit([
      route('POST', START, json(200, startedBody('sign_in', 'needs_email_verification'))),
    ])
    await fill(portal)
    await submit(portal)
    expect((await screen.findByRole('alert')).textContent).toContain('could not read')
    expect(portal.app.session.getSnapshot().status).toBe('signed_out')
    expect(portal.reports).toHaveLength(1)
  })

  test('a second submit while the first is running sends nothing', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const portal = visit([
      route('POST', START, async () => {
        await gate
        return json(200, startedBody('sign_in', 'needs_password'))
      }),
      signedIn,
    ])
    await fill(portal)
    const button = screen.getByRole('button', { name: 'Sign in' })
    await portal.user.click(button)
    await portal.user.click(button)
    await portal.user.keyboard('{Enter}')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Signing in...' }).getAttribute('aria-disabled')
      ).toBe('true')
    )
    release()
    await screen.findByRole('heading', { name: 'Home' })
    expect(portal.calls.filter((call) => call.path === START)).toHaveLength(1)
    expect(portal.calls.filter((call) => call.path === PASSWORD)).toHaveLength(1)
  })

  test('a session that ended is explained on the sign-in screen', async () => {
    const portal = visit([started, signedIn])
    await fill(portal)
    await submit(portal)
    await screen.findByRole('heading', { name: 'Home' })
    act(() => portal.app.session.rejected('access-1'))
    await screen.findByRole('heading', { name: 'Sign in' })
    expect((await screen.findByRole('status')).textContent).toContain(
      'Your session has ended. Sign in again.'
    )
  })

  test('links to sign-up for a new Organization', async () => {
    visit([])
    expect(
      (await screen.findByRole('link', { name: 'Create an Organization' })).getAttribute('href')
    ).toBe('/sign-up')
  })
})

describe('sign-in: lands on the dashboard whatever happened to the screen', () => {
  test('a person who clicks the other link while the password is being checked still lands on the dashboard', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const portal = visit([
      started,
      route('POST', PASSWORD, async () => {
        await gate
        return json(200, completeBody('sign_in'))
      }),
    ])
    await fill(portal)
    await submit(portal)
    await portal.user.click(screen.getByRole('link', { name: 'Create an Organization' }))
    await screen.findByRole('heading', { name: 'Create your Organization' })
    release()
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()
    expect(portal.app.session.getSnapshot().status).toBe('signed_in')
  })
})

describe('sign-in: the form', () => {
  test('tells the browser which field is the account name and which is the current password', async () => {
    visit([])
    expect((await screen.findByLabelText('Email address')).getAttribute('autocomplete')).toBe(
      'username'
    )
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('current-password')
  })

  test('two submits fired in the same tick send one sign-in', async () => {
    const portal = visit([started, signedIn])
    await fill(portal)
    const form = screen.getByRole('button', { name: 'Sign in' }).closest('form')
    if (form === null) {
      throw new Error('no form')
    }
    // Inside one act nothing re-renders between the two, so only the ref guard can stop the second.
    act(() => {
      fireEvent.submit(form)
      fireEvent.submit(form)
    })
    await screen.findByRole('heading', { name: 'Home' })
    expect(portal.calls.filter((call) => call.path === START)).toHaveLength(1)
  })
})
