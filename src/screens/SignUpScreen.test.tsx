import { describe, expect, test } from 'bun:test'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { AUTH_ERRORS } from 'tula-closeline-contract'
import { HANDLED_CODES } from '~/api/messages'
import { failure, type Handler, json, route } from '~/testing/fixtures'
import { completeBody, renderPortal, startedBody } from '~/testing/render'

const TOKEN = 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5'
const START = '/v1/client/sign-ups'
const VERIFY = '/v1/client/sign-ups/att_1/verify-email'
const RESEND = '/v1/client/sign-ups/att_1/resend-code'

const started = route('POST', START, json(200, startedBody('sign_up', 'needs_email_verification')))

type Portal = ReturnType<typeof renderPortal>

async function fillDetails(portal: Portal, overrides: { organization?: string | null } = {}) {
  const { user } = portal
  await user.type(await screen.findByLabelText('Email address'), ' Maya@Northline.app ')
  await user.type(screen.getByLabelText('Password'), 'correct horse battery')
  if (overrides.organization !== null) {
    await user.type(
      screen.getByLabelText('Organization name'),
      overrides.organization ?? 'Northline'
    )
  }
}

async function submitDetails(portal: Portal) {
  await portal.user.click(screen.getByRole('button', { name: 'Email me a code' }))
}

async function reachCodeStep(handlers: Handler[]) {
  const portal = renderPortal({ url: '/sign-up', handlers: [started, ...handlers] })
  await fillDetails(portal)
  await submitDetails(portal)
  await screen.findByRole('heading', { name: 'Check your email' })
  return portal
}

async function enterCode(portal: Portal, code = '123456') {
  const field = screen.getByLabelText('Code')
  await portal.user.clear(field)
  await portal.user.type(field, code)
  await portal.user.click(screen.getByRole('button', { name: 'Continue' }))
}

function errorOf(field: HTMLElement): HTMLElement {
  const id = field
    .getAttribute('aria-describedby')
    ?.split(' ')
    .find((part) => part.endsWith('-error'))
  const element = id ? document.getElementById(id) : null
  if (!element) {
    throw new Error('the field has no error described by aria-describedby')
  }
  return element
}

describe('sign-up: create an Organization', () => {
  test('details, then the emailed code, then the dashboard', async () => {
    const portal = await reachCodeStep([route('POST', VERIFY, json(200, completeBody('sign_up')))])
    const startCall = portal.calls.find((call) => call.path === START)
    expect(startCall?.body).toEqual({
      email: 'maya@northline.app',
      password: 'correct horse battery',
      organizationName: 'Northline',
    })
    expect(startCall?.headers.get('x-tula-client')).toBe('browser')
    expect(screen.getByText('maya@northline.app')).toBeTruthy()

    await enterCode(portal, '123 456')
    await screen.findByRole('heading', { name: 'Home' })
    const verifyCall = portal.calls.find((call) => call.path === VERIFY)
    expect(verifyCall?.body).toEqual({ code: '123456' })
    expect(verifyCall?.headers.get('x-tula-attempt')).toBe('attempt-secret-1')
    expect(await screen.findByText('Northline')).toBeTruthy()
    expect(screen.getByText('Owner')).toBeTruthy()
    expect(portal.app.session.getSnapshot().status).toBe('signed_in')
    expect(localStorage.length + sessionStorage.length).toBe(0)
    expect(portal.reports).toEqual([])
  })

  test('the password rules from the service are shown as a hint', async () => {
    renderPortal({ url: '/sign-up' })
    expect(await screen.findByText('Use 10 to 128 characters.')).toBeTruthy()
  })

  test('the first and last name are sent only when given', async () => {
    const portal = renderPortal({ url: '/sign-up', handlers: [started] })
    await fillDetails(portal)
    await portal.user.type(screen.getByLabelText('First name (optional)'), 'Maya')
    await submitDetails(portal)
    await screen.findByRole('heading', { name: 'Check your email' })
    expect(portal.calls.find((call) => call.path === START)?.body).toMatchObject({
      firstName: 'Maya',
    })
    expect(portal.calls.find((call) => call.path === START)?.body).not.toHaveProperty('lastName')
  })

  test('the page tells a person who already has an address on file nothing different', async () => {
    await reachCodeStep([])
    expect(
      screen.getByText(/If this address can be used to sign up, we emailed a 6-digit code/)
    ).toBeTruthy()
  })

  test('a new code can be requested, and the old one is said to stop working', async () => {
    const portal = await reachCodeStep([
      route('POST', RESEND, json(200, startedBody('sign_up', 'needs_email_verification'))),
    ])
    await portal.user.click(screen.getByRole('button', { name: 'Send a new code' }))
    expect((await screen.findByRole('status')).textContent).toContain('We sent a new code')
    expect(portal.calls.find((call) => call.path === RESEND)?.headers.get('x-tula-attempt')).toBe(
      'attempt-secret-1'
    )
  })

  test('the address can be changed after the code step', async () => {
    const portal = await reachCodeStep([])
    await portal.user.click(screen.getByRole('button', { name: 'Use a different address' }))
    expect(await screen.findByRole('heading', { name: 'Create your Organization' })).toBeTruthy()
    expect((screen.getByLabelText('Email address') as HTMLInputElement).value).toBe(
      'Maya@Northline.app'
    )
  })
})

describe('sign-up: checks before anything is sent', () => {
  test('empty details name each missing field and focus the first', async () => {
    const portal = renderPortal({ url: '/sign-up' })
    await screen.findByText('Use 10 to 128 characters.')
    await submitDetails(portal)
    const email = screen.getByLabelText('Email address')
    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(errorOf(email).textContent).toContain('Enter a valid email address.')
    expect(errorOf(screen.getByLabelText('Password')).textContent).toContain('Enter a password.')
    expect(errorOf(screen.getByLabelText('Organization name')).textContent).toContain(
      'Enter a valid Organization name.'
    )
    await waitFor(() => expect(document.activeElement === email).toBe(true))
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
  })

  test('a password shorter than the service rule is refused before sending', async () => {
    const portal = renderPortal({ url: '/sign-up' })
    await screen.findByText('Use 10 to 128 characters.')
    await portal.user.type(screen.getByLabelText('Email address'), 'maya@northline.app')
    await portal.user.type(screen.getByLabelText('Password'), 'short')
    await portal.user.type(screen.getByLabelText('Organization name'), 'Northline')
    await submitDetails(portal)
    const password = screen.getByLabelText('Password')
    expect(errorOf(password).textContent).toContain('The password is too short.')
    await waitFor(() => expect(document.activeElement === password).toBe(true))
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
  })

  test('a code that is not six digits is refused before sending', async () => {
    const portal = await reachCodeStep([])
    await enterCode(portal, '12ab')
    const code = screen.getByLabelText('Code')
    expect(errorOf(code).textContent).toContain('Enter the 6-digit code from the email.')
    expect(portal.calls.some((call) => call.path === VERIFY)).toBe(false)
  })

  test('the form can be completed with the keyboard alone', async () => {
    const portal = renderPortal({ url: '/sign-up', handlers: [started] })
    const { user } = portal
    await user.click(await screen.findByLabelText('Email address'))
    await user.keyboard('maya@northline.app{Tab}correct horse battery{Tab}Northline{Enter}')
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeTruthy()
  })
})

describe('sign-up: every error the start step can return has its own words', () => {
  const cases: [string, number, string, 'field' | 'form', Record<string, unknown> | undefined][] = [
    [AUTH_ERRORS['email.invalid'].code, 422, 'Enter a valid email address.', 'field', undefined],
    [AUTH_ERRORS['password.too_short'].code, 422, 'The password is too short.', 'field', undefined],
    [AUTH_ERRORS['password.too_long'].code, 422, 'The password is too long.', 'field', undefined],
    [
      AUTH_ERRORS['password.contains_user_info'].code,
      422,
      'The password contains your name or email address.',
      'field',
      undefined,
    ],
    [AUTH_ERRORS['password.common'].code, 422, 'That password is too common.', 'field', undefined],
    [
      AUTH_ERRORS['password.breached'].code,
      422,
      'That password has appeared in a data breach.',
      'field',
      undefined,
    ],
    [
      AUTH_ERRORS['signup.organization_name_invalid'].code,
      422,
      'Enter a valid Organization name.',
      'field',
      undefined,
    ],
    ['request.invalid', 400, 'Check the details you entered and try again.', 'form', undefined],
    ['rate.limited', 429, 'Too many tries. Try again in 45 seconds.', 'form', { retryAfter: 45 }],
    [
      'server.unavailable',
      503,
      'Closeline is busy right now. Try again in 2 minutes.',
      'form',
      { retryAfter: 90 },
    ],
    [
      AUTH_ERRORS['membership.unavailable'].code,
      503,
      'We could not set up your place in the Organization right now.',
      'form',
      undefined,
    ],
    [
      AUTH_ERRORS['mail.unavailable'].code,
      503,
      'We could not send the email right now. Try again in 1 second.',
      'form',
      { retryAfter: 1 },
    ],
    ['server.internal', 500, 'Something went wrong on our side. Try again.', 'form', undefined],
  ]

  test.each(cases)('%s', async (code, status, words, where, details) => {
    const portal = renderPortal({
      url: '/sign-up',
      handlers: [route('POST', START, failure(status, code, details))],
    })
    await fillDetails(portal)
    await submitDetails(portal)
    if (where === 'field') {
      await waitFor(() => {
        const invalid = document.querySelector('[aria-invalid="true"]')
        expect(invalid).toBeTruthy()
        expect(errorOf(invalid as HTMLElement).textContent).toContain(words)
        expect(document.activeElement === invalid).toBe(true)
      })
    } else {
      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain(words)
      await waitFor(() => expect(document.activeElement === alert).toBe(true))
    }
    // The details stay on screen so the person can fix them.
    expect((screen.getByLabelText('Email address') as HTMLInputElement).value).toContain('Maya')
  })

  test('a rate limit with a Retry-After header shows that time', async () => {
    const portal = renderPortal({
      url: '/sign-up',
      handlers: [
        route('POST', START, failure(429, 'rate.limited', undefined, { 'retry-after': '12' })),
      ],
    })
    await fillDetails(portal)
    await submitDetails(portal)
    expect((await screen.findByRole('alert')).textContent).toContain('Try again in 12 seconds.')
  })

  test('the service being down with no time given says to try shortly', async () => {
    const portal = renderPortal({
      url: '/sign-up',
      handlers: [route('POST', START, failure(503, 'server.unavailable'))],
    })
    await fillDetails(portal)
    await submitDetails(portal)
    expect((await screen.findByRole('alert')).textContent).toContain('Try again shortly.')
    // A 5xx is a fault of ours, so it is reported; the 4xx cases above are not.
    expect(portal.reports).toHaveLength(1)
  })

  test('a failure to reach the service is explained, and not reported', async () => {
    const portal = renderPortal({
      url: '/sign-up',
      handlers: [
        () => {
          throw new TypeError('Failed to fetch')
        },
      ],
    })
    await fillDetails(portal)
    await submitDetails(portal)
    expect((await screen.findByRole('alert')).textContent).toContain('Could not reach Closeline.')
    expect(portal.reports).toEqual([])
  })

  test('a code nobody planned for gets the generic words, not the server text', async () => {
    const portal = renderPortal({
      url: '/sign-up',
      handlers: [route('POST', START, failure(418, 'teapot.short_and_stout'))],
    })
    await fillDetails(portal)
    await submitDetails(portal)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Something went wrong. Try again.')
    expect(alert.textContent).not.toContain('Text the portal never shows')
  })

  test('the table above covers every code the portal knows by name', () => {
    const tested = new Set(cases.map(([code]) => code))
    const elsewhere = new Set([
      AUTH_ERRORS['signup.invitation_invalid'].code,
      AUTH_ERRORS['verification.invalid_code'].code,
      AUTH_ERRORS['verification.expired'].code,
      AUTH_ERRORS['verification.too_many_attempts'].code,
      AUTH_ERRORS['flow.not_found'].code,
      AUTH_ERRORS['flow.invalid_step'].code,
      AUTH_ERRORS['auth.invalid_credentials'].code,
      AUTH_ERRORS['auth.user_banned'].code,
      AUTH_ERRORS['auth.no_organization'].code,
      'server.timeout',
      'client.timeout',
      'client.network',
      'client.bad_response',
    ])
    for (const code of HANDLED_CODES) {
      expect(tested.has(code) || elsewhere.has(code)).toBe(true)
    }
  })
})

describe('sign-up: the emailed code step', () => {
  test('a wrong code is said to be wrong, beside the field, and the attempt stays open', async () => {
    const portal = await reachCodeStep([
      route('POST', VERIFY, failure(422, AUTH_ERRORS['verification.invalid_code'].code)),
    ])
    await enterCode(portal)
    const code = screen.getByLabelText('Code')
    await waitFor(() => expect(errorOf(code).textContent).toContain('That code is not right.'))
    expect(document.activeElement === code).toBe(true)
    expect(screen.getByRole('button', { name: 'Send a new code' })).toBeTruthy()
  })

  test('an expired code says to ask for a new one', async () => {
    const portal = await reachCodeStep([
      route('POST', VERIFY, failure(422, AUTH_ERRORS['verification.expired'].code)),
    ])
    await enterCode(portal)
    expect((await screen.findByRole('alert')).textContent).toContain(
      'That code has expired. Send a new code.'
    )
  })

  test('too many wrong codes says to ask for a new one', async () => {
    const portal = await reachCodeStep([
      route('POST', VERIFY, failure(429, AUTH_ERRORS['verification.too_many_attempts'].code)),
    ])
    await enterCode(portal)
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Too many wrong codes. Send a new code.'
    )
  })

  test.each([AUTH_ERRORS['flow.not_found'].code, AUTH_ERRORS['flow.invalid_step'].code])(
    'an attempt that has ended (%s) sends the person back to the start with the details kept',
    async (code) => {
      const portal = await reachCodeStep([
        route(
          'POST',
          VERIFY,
          failure(code === AUTH_ERRORS['flow.not_found'].code ? 404 : 409, code)
        ),
      ])
      await enterCode(portal)
      expect(await screen.findByRole('heading', { name: 'Create your Organization' })).toBeTruthy()
      expect((await screen.findByRole('alert')).textContent).toContain('Start again.')
      expect((screen.getByLabelText('Email address') as HTMLInputElement).value).toContain('Maya')
    }
  )

  test('a rate limit on the code shows the retry time', async () => {
    const portal = await reachCodeStep([
      route('POST', VERIFY, failure(429, 'rate.limited', { retryAfter: 30 })),
    ])
    await enterCode(portal)
    expect((await screen.findByRole('alert')).textContent).toContain('Try again in 30 seconds.')
  })

  test('the Organization service being down says the code still works, with the retry time', async () => {
    const portal = await reachCodeStep([
      route(
        'POST',
        VERIFY,
        failure(503, AUTH_ERRORS['membership.unavailable'].code, { retryAfter: 5 })
      ),
    ])
    await enterCode(portal)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Your code still works.')
    expect(alert.textContent).toContain('Try again in 5 seconds.')
    expect(portal.app.session.getSnapshot().status).toBe('signed_out')
  })

  test('a name the Organization service refuses sends the person back to fix it', async () => {
    const portal = await reachCodeStep([
      route('POST', VERIFY, failure(422, AUTH_ERRORS['signup.organization_name_invalid'].code)),
    ])
    await enterCode(portal)
    const field = await screen.findByLabelText('Organization name')
    expect(errorOf(field).textContent).toContain('Enter a valid Organization name.')
  })

  test('a resend that is rate limited shows the retry time', async () => {
    const portal = await reachCodeStep([
      route('POST', RESEND, failure(429, 'rate.limited', { retryAfter: 60 })),
    ])
    await portal.user.click(screen.getByRole('button', { name: 'Send a new code' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Try again in 1 minute.')
  })

  test('a done step without a session is an error to report, not a silent success', async () => {
    const portal = await reachCodeStep([
      route('POST', VERIFY, json(200, startedBody('sign_up', 'needs_email_verification'))),
    ])
    await enterCode(portal)
    expect((await screen.findByRole('alert')).textContent).toContain('could not read')
    expect(portal.reports).toHaveLength(1)
  })
})

describe('sign-up: accept an Invitation', () => {
  test('the token comes from the address fragment, is removed from the address bar, and is sent as the Invitation', async () => {
    const portal = renderPortal({
      url: `/sign-up#invitation=${TOKEN}`,
      handlers: [started, route('POST', VERIFY, json(200, completeBody('sign_up')))],
    })
    expect(window.location.hash).toBe('')
    expect(window.location.href).not.toContain(TOKEN)
    expect(await screen.findByRole('heading', { name: 'Accept your Invitation' })).toBeTruthy()
    expect(screen.queryByLabelText('Organization name')).toBeNull()

    await fillDetails(portal, { organization: null })
    await submitDetails(portal)
    await screen.findByRole('heading', { name: 'Check your email' })
    expect(portal.calls.find((call) => call.path === START)?.body).toEqual({
      email: 'maya@northline.app',
      password: 'correct horse battery',
      invitationToken: TOKEN,
    })
    await enterCode(portal)
    await screen.findByRole('heading', { name: 'Home' })
    expect(window.location.href).not.toContain(TOKEN)
    expect(portal.app.invitation.current()).toEqual({ status: 'none' })
  })

  test('the token is never handed to the error reporter, even when the service fails', async () => {
    const portal = renderPortal({
      url: `/sign-up#invitation=${TOKEN}`,
      handlers: [route('POST', START, failure(500, 'server.internal'))],
    })
    await fillDetails(portal, { organization: null })
    await submitDetails(portal)
    await screen.findByRole('alert')
    expect(portal.reports).toHaveLength(1)
    for (const report of portal.reports) {
      expect(`${report.name} ${report.message} ${report.stack}`).not.toContain(TOKEN)
    }
  })

  test('an Invitation the service refuses is explained, and an Organization can be created instead', async () => {
    const portal = renderPortal({
      url: `/sign-up#invitation=${TOKEN}`,
      handlers: [route('POST', START, failure(422, AUTH_ERRORS['signup.invitation_invalid'].code))],
    })
    await fillDetails(portal, { organization: null })
    await submitDetails(portal)
    expect((await screen.findByRole('alert')).textContent).toContain(
      'This Invitation is not valid.'
    )
    await portal.user.click(screen.getByRole('button', { name: 'Create an Organization instead' }))
    expect(await screen.findByLabelText('Organization name')).toBeTruthy()
    expect(portal.app.invitation.current()).toEqual({ status: 'none' })
  })

  test('an Invitation the service refuses at the code step sends the person back', async () => {
    const portal = renderPortal({
      url: `/sign-up#invitation=${TOKEN}`,
      handlers: [
        started,
        route('POST', VERIFY, failure(422, AUTH_ERRORS['signup.invitation_invalid'].code)),
      ],
    })
    await fillDetails(portal, { organization: null })
    await submitDetails(portal)
    await screen.findByRole('heading', { name: 'Check your email' })
    await enterCode(portal)
    expect((await screen.findByRole('alert')).textContent).toContain(
      'This Invitation is not valid.'
    )
    expect(
      await screen.findByRole('button', { name: 'Create an Organization instead' })
    ).toBeTruthy()
  })

  test('an Invitation the service refuses is forgotten: leaving and coming back shows the Organization form', async () => {
    const portal = renderPortal({
      url: `/sign-up#invitation=${TOKEN}`,
      handlers: [route('POST', START, failure(422, AUTH_ERRORS['signup.invitation_invalid'].code))],
    })
    await fillDetails(portal, { organization: null })
    await submitDetails(portal)
    await screen.findByRole('alert')
    expect(portal.app.invitation.current()).toEqual({ status: 'none' })
    await portal.user.click(screen.getByRole('link', { name: 'Sign in instead' }))
    await screen.findByRole('heading', { name: 'Sign in' })
    await portal.user.click(screen.getByRole('link', { name: 'Create an Organization' }))
    expect(await screen.findByRole('heading', { name: 'Create your Organization' })).toBeTruthy()
    expect(screen.getByLabelText('Organization name')).toBeTruthy()
  })

  test('a fragment that cannot be an Invitation is refused up front, and still removed', async () => {
    const portal = renderPortal({ url: '/sign-up#invitation=short' })
    expect(window.location.hash).toBe('')
    expect((await screen.findByRole('alert')).textContent).toContain(
      'This Invitation is not valid.'
    )
    await portal.user.click(screen.getByRole('button', { name: 'Create an Organization instead' }))
    expect(await screen.findByLabelText('Organization name')).toBeTruthy()
  })
})

describe('sign-up: double submission', () => {
  test('a second submit while the first is running sends nothing and the button says it is busy', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const portal = renderPortal({
      url: '/sign-up',
      handlers: [
        route('POST', START, async () => {
          await gate
          return json(200, startedBody('sign_up', 'needs_email_verification'))
        }),
      ],
    })
    await fillDetails(portal)
    const button = screen.getByRole('button', { name: 'Email me a code' })
    await portal.user.click(button)
    await portal.user.click(button)
    await portal.user.keyboard('{Enter}')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Sending a code...' })).toBeTruthy()
    )
    expect(
      screen.getByRole('button', { name: 'Sending a code...' }).getAttribute('aria-disabled')
    ).toBe('true')
    release()
    await screen.findByRole('heading', { name: 'Check your email' })
    expect(portal.calls.filter((call) => call.path === START)).toHaveLength(1)
  })
})

describe('sign-up: fields are labelled for assistive technology', () => {
  test('every input has a label, and the error is tied to its field', async () => {
    const portal = renderPortal({ url: '/sign-up' })
    await screen.findByText('Use 10 to 128 characters.')
    for (const label of [
      'Email address',
      'Password',
      'Organization name',
      'First name (optional)',
      'Last name (optional)',
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy()
    }
    await submitDetails(portal)
    const email = screen.getByLabelText('Email address')
    const message = errorOf(email)
    expect(within(message).getByText('Error:')).toBeTruthy()
    expect(screen.getByLabelText('Password').getAttribute('aria-describedby')).toContain('-hint')
  })
})

describe('sign-up: lands on the dashboard whatever happened to the screen', () => {
  test('a person who leaves the screen while the code is being checked still lands on the dashboard', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const portal = await reachCodeStep([
      route('POST', VERIFY, async () => {
        await gate
        return json(200, completeBody('sign_up'))
      }),
    ])
    await enterCode(portal)
    // Leave the screen (as the back button would) while the code is still being checked.
    await act(() => portal.router.navigate({ to: '/sign-in' }))
    await screen.findByRole('heading', { name: 'Sign in' })
    release()
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()
  })
})

describe('sign-up: the form', () => {
  test('asks the browser for a new password, not the saved one', async () => {
    renderPortal({ url: '/sign-up' })
    expect((await screen.findByLabelText('Email address')).getAttribute('autocomplete')).toBe(
      'email'
    )
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('new-password')
  })

  test('two submits of the details fired in the same tick send one sign-up', async () => {
    const portal = renderPortal({ url: '/sign-up', handlers: [started] })
    await fillDetails(portal)
    const form = screen.getByRole('button', { name: 'Email me a code' }).closest('form')
    if (form === null) {
      throw new Error('no form')
    }
    act(() => {
      fireEvent.submit(form)
      fireEvent.submit(form)
    })
    await screen.findByRole('heading', { name: 'Check your email' })
    expect(portal.calls.filter((call) => call.path === START)).toHaveLength(1)
  })
})
