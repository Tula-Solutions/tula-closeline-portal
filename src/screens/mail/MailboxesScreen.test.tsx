import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { parseEnv } from '~/env'
import { CEILINGS, mailbox, mailId } from '~/screens/mail/mail-fixtures'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const STAGING = parseEnv({
  VITE_ENVIRONMENT: 'staging',
  VITE_SENTRY_DSN: 'https://public@sentry.example/1',
})
const LIST = '/v1/mailboxes'
const page = (...items: unknown[]) => json(200, { items, nextCursor: null })
const ceilings = route('GET', '/v1/mail/limits', json(200, CEILINGS))

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

afterEach(cleanup)

describe('Mailboxes: list', () => {
  test('shows state, set and effective limits and the ramp', async () => {
    visit('rep', '/mailboxes', [
      route(
        'GET',
        LIST,
        page(
          mailbox(1, {
            state: 'warming',
            ramp: { active: true, dayIndex: 3, perDayNow: 20, steps: [{ fromDay: 1, perDay: 10 }] },
            effectiveLimits: { perDay: 20, perHour: 20, minGapSeconds: 30 },
          })
        )
      ),
      ceilings,
    ])
    const list = await screen.findByRole('list', { name: 'Mailboxes' })
    expect(within(list).getByText('rep1@northline.app')).toBeTruthy()
    expect(within(list).getByText('Warming up')).toBeTruthy()
    expect(
      within(list).getByText(/Warming up: day 3, sending 20 a day for now, rising to 100/)
    ).toBeTruthy()
    expect(within(list).getByText(/set to 100 and 20; cut while it recovers/)).toBeTruthy()
  })

  test('a paused Mailbox says why and what to do, and a Rep cannot resume an Admin pause', async () => {
    visit('rep', '/mailboxes', [
      route('GET', LIST, page(mailbox(1, { state: 'paused', stateReason: 'complaint_spike' }))),
      ceilings,
    ])
    expect(await screen.findByText(/Too many recipients marked its mail as spam/)).toBeTruthy()
    expect(screen.getByText(/An Owner or Admin resumes it once that is fixed/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull()
  })

  test('an Admin resumes an auto-paused Mailbox', async () => {
    let resumed = false
    const portal = visit('admin', '/mailboxes', [
      route('POST', `${LIST}/${mailId('mbx', 1)}/resume`, () => {
        resumed = true
        return json(200, mailbox(1))
      }),
      route('GET', LIST, () =>
        page(mailbox(1, resumed ? {} : { state: 'paused', stateReason: 'bounce_spike' }))
      ),
      ceilings,
    ])
    await portal.user.click(await screen.findByRole('button', { name: 'Resume' }))
    expect(await screen.findByText('The Mailbox is sending again.')).toBeTruthy()
  })

  test('a Mailbox whose access was revoked says to connect it again', async () => {
    visit('rep', '/mailboxes', [
      route('GET', LIST, page(mailbox(1, { state: 'disconnected', stateReason: 'auth_revoked' }))),
      ceilings,
    ])
    expect(
      await screen.findByText(/no longer allows access\. Connect the Mailbox again\./)
    ).toBeTruthy()
  })

  test('a failed list shows words for the code, not the service text', async () => {
    visit('rep', '/mailboxes', [route('GET', LIST, failure(503, 'service.unavailable')), ceilings])
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('Text the portal never shows.')).toBeNull()
  })
})

describe('Mailboxes: details', () => {
  const id = mailId('mbx', 1)
  const open = async (role: 'owner' | 'rep', extra: Handler[]) => {
    const portal = visit(role, '/mailboxes', [
      route('GET', LIST, page(mailbox(1))),
      ceilings,
      ...extra,
    ])
    await portal.user.click(
      await screen.findByRole('button', { name: 'Limits, health and domain' })
    )
    return portal
  }
  const noHealth = route('GET', `${LIST}/${id}/health`, failure(404, 'mailbox.not_found'))
  const noDomain = route('GET', `${LIST}/${id}/domain-check`, failure(404, 'mailbox.not_found'))

  test('health shows the score and what it is made of', async () => {
    await open('rep', [
      route(
        'GET',
        `${LIST}/${id}/health`,
        json(200, {
          mailboxId: id,
          status: 'scored',
          score: 62,
          effect: 'limit_halved',
          windowDays: 14,
          sampleSize: 80,
          minimumSample: 50,
          components: [
            {
              component: 'hard_bounce_rate',
              value: 0.04,
              weight: 40,
              warningThreshold: 0.02,
              criticalThreshold: 0.05,
              state: 'warning',
            },
          ],
          scoredAt: '2026-10-01T10:00:00.000Z',
        })
      ),
      noDomain,
    ])
    expect(await screen.findByText(/Health score 62 of 100/)).toBeTruthy()
    expect(screen.getByText(/daily limit is halved/)).toBeTruthy()
    expect(
      screen.getByText(/Hard bounces: 4%, Warning\. Warning from 2%, critical from 5%\./)
    ).toBeTruthy()
  })

  test('the domain check lists each record and an Owner can run it', async () => {
    let checked = false
    const result = () =>
      json(200, {
        mailboxId: id,
        domain: 'northline.app',
        results: [
          {
            record: 'dmarc',
            status: 'missing',
            explanation: 'No DMARC record was found.',
            suggestedRecord: 'v=DMARC1; p=none',
          },
        ],
        checkedAt: '2026-10-01T10:00:00.000Z',
      })
    const portal = await open('owner', [
      noHealth,
      route('POST', `${LIST}/${id}/domain-check`, () => {
        checked = true
        return result()
      }),
      route('GET', `${LIST}/${id}/domain-check`, () =>
        checked
          ? result()
          : json(200, { mailboxId: id, domain: 'northline.app', results: [], checkedAt: null })
      ),
    ])
    expect(await screen.findByText(/has not been checked yet/)).toBeTruthy()
    await portal.user.click(screen.getByRole('button', { name: 'Check domain now' }))
    expect(await screen.findByText('No DMARC record was found.')).toBeTruthy()
    expect(screen.getByText('v=DMARC1; p=none')).toBeTruthy()
    const post = portal.calls.find(
      (call) => call.method === 'POST' && call.path.endsWith('/domain-check')
    )
    expect(post?.headers.get('idempotency-key')).toBeTruthy()
  })

  test('a Rep cannot run the domain check', async () => {
    await open('rep', [
      noHealth,
      route(
        'GET',
        `${LIST}/${id}/domain-check`,
        json(200, { mailboxId: id, domain: 'northline.app', results: [], checkedAt: null })
      ),
    ])
    await screen.findByText(/has not been checked yet/)
    expect(screen.queryByRole('button', { name: 'Check domain now' })).toBeNull()
  })

  test('limits above the Organization ceiling are refused before any call', async () => {
    const portal = await open('rep', [noHealth, noDomain])
    const field = await screen.findByLabelText('Emails per day')
    await portal.user.clear(field)
    await portal.user.type(field, '500')
    await portal.user.click(screen.getByRole('button', { name: 'Save limits' }))
    expect(await screen.findByText(/from 1 to 200, your Organization's ceiling/)).toBeTruthy()
    expect(portal.calls.some((call) => call.method === 'PUT')).toBe(false)
  })

  test('valid limits are saved with the existing sending hours kept', async () => {
    const portal = await open('rep', [
      noHealth,
      noDomain,
      route('PUT', `${LIST}/${id}/limits`, json(200, mailbox(1))),
    ])
    const field = await screen.findByLabelText('Emails per day')
    await portal.user.clear(field)
    await portal.user.type(field, '150')
    await portal.user.click(screen.getByRole('button', { name: 'Save limits' }))
    expect(await screen.findByText('Limits saved.')).toBeTruthy()
    const put = portal.calls.find((call) => call.method === 'PUT')
    expect(put?.body).toMatchObject({
      perDay: 150,
      perHour: 20,
      minGapSeconds: 30,
      window: { timeZone: 'Europe/London' },
    })
  })

  test('the service refusing a limit above the ceiling shows its words', async () => {
    const portal = await open('rep', [
      noHealth,
      noDomain,
      route('PUT', `${LIST}/${id}/limits`, failure(422, 'mailbox.limit_above_ceiling')),
    ])
    await portal.user.click(await screen.findByRole('button', { name: 'Save limits' }))
    expect(await screen.findByText(/higher than your Organization allows/)).toBeTruthy()
  })
})

describe('Mailboxes: connect', () => {
  const start = (url: string) =>
    route(
      'POST',
      `${LIST}/connect`,
      json(200, { authorizationUrl: url, expiresAt: '2026-10-01T10:10:00.000Z' })
    )

  test('Connect goes to the provider, and a shared Mailbox is offered to an Admin only', async () => {
    const assigned: string[] = []
    const portal = visit(
      'rep',
      '/mailboxes',
      [route('GET', LIST, page()), ceilings, start('http://127.0.0.1:3010/consent?x=1')],
      {
        assign: (url) => assigned.push(url),
      }
    )
    expect(screen.queryByLabelText('Whose Mailbox')).toBeNull()
    await portal.user.click(await screen.findByRole('button', { name: 'Connect Gmail' }))
    await waitFor(() => expect(assigned).toEqual(['http://127.0.0.1:3010/consent?x=1']))
    expect(portal.calls.find((call) => call.path.endsWith('/connect'))?.body).toMatchObject({
      provider: 'gmail',
      kind: 'personal',
    })
    cleanup()
    visit('admin', '/mailboxes', [route('GET', LIST, page()), ceilings])
    expect(await screen.findByLabelText('Whose Mailbox')).toBeTruthy()
  })

  test('an address that is not https is refused outside the local stack', async () => {
    const assigned: string[] = []
    const portal = visit(
      'rep',
      '/mailboxes',
      [route('GET', LIST, page()), ceilings, start('http://consent.example/auth')],
      { assign: (url) => assigned.push(url), staging: true }
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Connect Gmail' }))
    expect(await screen.findByText(/will not open/)).toBeTruthy()
    expect(assigned).toEqual([])
  })

  test('the return completes the connection and clears the code and state from the address', async () => {
    let connected = false
    const portal = visit(
      'rep',
      '/mailboxes/connect/callback?code=SECRET-CODE&state=state-abcdefghijklmnop',
      [
        route('POST', `${LIST}/connect/complete`, () => {
          connected = true
          return json(200, mailbox(1))
        }),
        route('GET', LIST, () => page(...(connected ? [mailbox(1)] : []))),
        ceilings,
      ]
    )
    expect(await screen.findByText('The Mailbox is connected.')).toBeTruthy()
    expect(await screen.findByText('rep1@northline.app')).toBeTruthy()
    const post = portal.calls.find((call) => call.path.endsWith('/complete'))
    expect(post?.body).toEqual({ state: 'state-abcdefghijklmnop', code: 'SECRET-CODE' })
    expect(portal.router.state.location.href).toBe('/mailboxes/connect/callback')
    expect(document.body.textContent).not.toContain('SECRET-CODE')
  })

  test('a refused return sends nothing and says so', async () => {
    const portal = visit('rep', '/mailboxes/connect/callback?error=access_denied', [
      route('GET', LIST, page()),
      ceilings,
    ])
    expect(await screen.findByText(/did not allow access/)).toBeTruthy()
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
  })

  test('an expired attempt shows the contract code words', async () => {
    visit('rep', '/mailboxes/connect/callback?code=c&state=state-abcdefghijklmnop', [
      route('POST', `${LIST}/connect/complete`, failure(422, 'mailbox.oauth_state_invalid')),
      route('GET', LIST, page()),
      ceilings,
    ])
    expect(await screen.findByText(/expired or was already used/)).toBeTruthy()
  })
})

describe('Mailboxes: disconnect and keyboard', () => {
  test('Disconnect asks first, then sends an idempotency key', async () => {
    let gone = false
    const portal = visit('rep', '/mailboxes', [
      route('DELETE', `${LIST}/${mailId('mbx', 1)}`, () => {
        gone = true
        return json(200, {})
      }),
      route('GET', LIST, () => page(...(gone ? [] : [mailbox(1)]))),
      ceilings,
    ])
    await portal.user.click(
      await screen.findByRole('button', { name: 'Disconnect rep1@northline.app' })
    )
    await portal.user.click(screen.getByRole('button', { name: 'Disconnect Mailbox' }))
    expect(await screen.findByText('The Mailbox is disconnected.')).toBeTruthy()
    expect(
      portal.calls.find((call) => call.method === 'DELETE')?.headers.get('idempotency-key')
    ).toBeTruthy()
  })

  test('the details toggle works from the keyboard and reports its state', async () => {
    const portal = visit('rep', '/mailboxes', [route('GET', LIST, page(mailbox(1))), ceilings])
    const toggle = await screen.findByRole('button', { name: 'Limits, health and domain' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    toggle.focus()
    await portal.user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Hide details' }).getAttribute('aria-expanded')).toBe(
      'true'
    )
  })
})

for (const theme of ['light', 'dark'] as const) {
  describe(`Mailboxes: accessibility in ${theme}`, () => {
    test('has no axe violations', async () => {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
      }
      const portal = visit('admin', '/mailboxes', [
        route(
          'GET',
          LIST,
          page(mailbox(1), mailbox(2, { state: 'paused', stateReason: 'admin_paused' }))
        ),
        ceilings,
        route('GET', `${LIST}/${mailId('mbx', 1)}/health`, failure(404, 'mailbox.not_found')),
        route(
          'GET',
          `${LIST}/${mailId('mbx', 1)}/domain-check`,
          json(200, {
            mailboxId: mailId('mbx', 1),
            domain: 'northline.app',
            results: [],
            checkedAt: null,
          })
        ),
      ])
      await portal.user.click(
        (
          await screen.findAllByRole('button', { name: 'Limits, health and domain' })
        )[0] as HTMLElement
      )
      await screen.findByLabelText('Emails per day')
      const result = await axe.run(document.body, {
        rules: { 'color-contrast': { enabled: false } },
      })
      document.documentElement.classList.remove('dark')
      expect(result.violations.map((v) => v.id)).toEqual([])
    })
  })
}
