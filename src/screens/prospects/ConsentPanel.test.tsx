import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { CONSENT_ERRORS, PROSPECT_ERRORS } from 'tula-closeline-contract'
import {
  consentBody,
  consentEventBody,
  hexId,
  page,
  prospectBody,
  withdrawalEventBody,
  wordingBody,
} from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'
import { choose, optionsOf } from '~/testing/select'

const ID = hexId('prs', 1)
const ONE = `/v1/prospects/${ID}`
const CONSENT = `${ONE}/consent`
const EVENTS = `${ONE}/consent-events`
const GRANTS = `${ONE}/consents`
const WITHDRAWALS = `${ONE}/consent-withdrawals`
const WORDINGS = '/v1/consent-wordings'

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', ...handlers: Handler[]) {
  return renderPortal({
    url: `/prospects/${ID}`,
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers: [...handlers, route('GET', ONE, json(200, prospectBody(1)))],
  })
}

const wordings = route(
  'GET',
  WORDINGS,
  json(
    200,
    page([
      wordingBody(1, {
        text: 'We may call or text you about Northline.',
        channels: ['phone', 'sms'],
      }),
      wordingBody(2, { text: 'We may email you about Northline.', channels: ['email'] }),
    ])
  )
)
const noEvents = route('GET', EVENTS, json(200, page([])))
const mixed = route(
  'GET',
  CONSENT,
  json(200, consentBody(1, { phone: 'granted', sms: 'withdrawn' }))
)

const item = (name: string) => {
  const list = screen.getByRole('list', { name: 'Contact Consent by channel' })
  const found = within(list)
    .getAllByRole('listitem')
    .find((li) => within(li).queryByRole('heading', { name }) !== null)
  if (!found) {
    throw new Error(`no channel ${name}`)
  }
  return found
}

afterEach(() => {
  document.documentElement.classList.remove('dark')
  cleanup()
})

describe('Contact Consent: the state of each channel', () => {
  test('shows every channel with its state and when it began', async () => {
    visit('rep', mixed, noEvents, wordings)
    await screen.findByRole('heading', { name: 'Phone' })
    expect(item('Phone').textContent).toContain('Granted')
    expect(item('Phone').querySelector('time')).not.toBeNull()
    expect(item('Text message').textContent).toContain('Withdrawn')
    expect(item('WhatsApp').textContent).toContain('No consent yet')
    expect(item('Email').textContent).toContain('No consent yet')
    expect(item('LinkedIn').textContent).toContain('No consent yet')
  })

  test('a channel that needs consent and has none is shown as denied, in words', async () => {
    visit('rep', mixed, noEvents, wordings)
    await screen.findByRole('heading', { name: 'Phone' })
    expect(item('Phone').textContent).not.toContain('Contact denied')
    expect(item('Text message').textContent).toContain('Contact denied')
    expect(item('Text message').textContent).toContain('withdrawn')
    expect(item('WhatsApp').textContent).toContain('Contact denied')
    expect(item('WhatsApp').textContent).toContain('no Contact Consent is recorded')
    expect(item('Email').textContent).not.toContain('Contact denied')
    expect(item('LinkedIn').textContent).not.toContain('Contact denied')
  })

  test('a withdrawal on a channel that needs no consent is still shown as denied', async () => {
    visit(
      'rep',
      route('GET', CONSENT, json(200, consentBody(1, { email: 'withdrawn' }))),
      noEvents,
      wordings
    )
    await screen.findByRole('heading', { name: 'Email' })
    expect(item('Email').textContent).toContain('Contact denied')
  })

  test('a suppressed Prospect is denied on every channel, with the reason', async () => {
    visit(
      'rep',
      route(
        'GET',
        CONSENT,
        json(
          200,
          consentBody(
            1,
            { phone: 'granted', email: 'granted' },
            { suppressed: true, suppressionReason: 'unsubscribe' }
          )
        )
      ),
      noEvents,
      wordings
    )
    const banner = await screen.findByText(/on the Suppression list/)
    expect(banner.textContent).toContain('Unsubscribed')
    for (const name of ['Phone', 'Text message', 'WhatsApp', 'Email', 'LinkedIn']) {
      expect(item(name).textContent).toContain('Contact denied')
    }
  })

  test('says so when the consent cannot be read', async () => {
    visit(
      'rep',
      route('GET', CONSENT, failure(404, PROSPECT_ERRORS['prospect.not_found'].code)),
      noEvents,
      wordings
    )
    expect(await screen.findByText(/no longer exists, or you cannot see it/)).toBeTruthy()
  })
})

describe('Contact Consent: the evidence', () => {
  test('lists the ledger newest first in ruled rows, with the wording and the evidence', async () => {
    visit(
      'rep',
      mixed,
      wordings,
      route(
        'GET',
        EVENTS,
        json(
          200,
          page([
            withdrawalEventBody(2, {
              channel: 'sms',
              source: 'stop_reply',
              occurredAt: '2026-10-04T12:00:00Z',
            }),
            consentEventBody(1, { evidenceRef: '<b>Call notes</b>, 3 October' }),
          ])
        )
      )
    )
    const list = await screen.findByRole('list', { name: 'Consent evidence' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('Withdrawn')
    expect(rows[0]?.textContent).toContain('Text message')
    expect(rows[0]?.textContent).toContain('Replied STOP')
    expect(rows[1]?.textContent).toContain('Granted')
    expect(rows[1]?.textContent).toContain('Phone')
    expect(rows[1]?.textContent).toContain('Said on a call')
    expect(rows[1]?.textContent).toContain('We may call or text you about Northline.')
    expect(rows[1]?.textContent).toContain('<b>Call notes</b>, 3 October')
    expect(rows[1]?.querySelector('b')).toBeNull()
    expect(rows[1]?.querySelector('time')).not.toBeNull()
  })

  test('says when a withdrawal covered every channel', async () => {
    visit(
      'rep',
      mixed,
      wordings,
      route('GET', EVENTS, json(200, page([withdrawalEventBody(3, { stopAll: true })])))
    )
    const list = await screen.findByRole('list', { name: 'Consent evidence' })
    expect(list.textContent).toContain('every channel')
  })

  test('says when there is no evidence yet', async () => {
    visit('rep', route('GET', CONSENT, json(200, consentBody(1))), noEvents, wordings)
    expect(await screen.findByText('No consent has been recorded for this Prospect.')).toBeTruthy()
  })

  test('loads the ledger a page at a time', async () => {
    const portal = visit(
      'rep',
      mixed,
      wordings,
      route('GET', EVENTS, (call) =>
        new URL(call.url, 'http://x.test').searchParams.get('cursor') === 'c2'
          ? json(200, page([consentEventBody(1)]))
          : json(200, page([withdrawalEventBody(2, { channel: 'sms' })], 'c2'))
      )
    )
    await screen.findByRole('list', { name: 'Consent evidence' })
    await portal.user.click(screen.getByRole('button', { name: /Load more/ }))
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Consent evidence' })).getAllByRole('listitem')
      ).toHaveLength(2)
    )
  })
})

describe('Contact Consent: recording a grant', () => {
  test('sends the channel, source, wording and evidence with one idempotency key, then refreshes', async () => {
    const portal = visit(
      'rep',
      route(
        'POST',
        GRANTS,
        json(201, {
          events: [consentEventBody(5)],
          consent: consentBody(1, { whatsapp: 'granted' }),
        })
      ),
      route('GET', CONSENT, json(200, consentBody(1))),
      noEvents,
      wordings
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Record consent for Phone' }))
    await choose(portal.user, screen.getByLabelText('Source'), 'crm')
    await portal.user.type(screen.getByLabelText('Evidence reference'), '  HubSpot note 42  ')
    await portal.user.click(screen.getByRole('button', { name: 'Record consent' }))
    await waitFor(() => expect(screen.getByText('Consent recorded on Phone.')).toBeTruthy())
    const posts = portal.calls.filter((call) => call.method === 'POST' && call.path === GRANTS)
    expect(posts).toHaveLength(1)
    expect(posts[0]?.body).toEqual({
      channel: 'phone',
      source: 'crm',
      wordingId: hexId('cwd', 1),
      evidenceRef: 'HubSpot note 42',
    })
    expect(posts[0]?.headers.get('idempotency-key')).toMatch(/^[A-Za-z0-9_.:-]{16,128}$/)
    expect(
      portal.calls.filter((c) => c.method === 'GET' && c.path === CONSENT).length
    ).toBeGreaterThan(1)
  })

  test('offers only the Consent Wordings that cover the channel', async () => {
    const portal = visit('rep', mixed, noEvents, wordings)
    await portal.user.click(await screen.findByRole('button', { name: 'Record consent for Email' }))
    const select = await screen.findByLabelText('Consent Wording')
    expect(
      (await optionsOf(portal.user, select)).map((o) => o.text.replace(/[\u2068\u2069]/g, ''))
    ).toEqual(['We may email you about Northline.'])
  })

  test('says so, and sends nothing, when no Consent Wording covers the channel', async () => {
    const portal = visit(
      'rep',
      route(
        'GET',
        WORDINGS,
        json(200, page([wordingBody(1, { text: 'Phone only', channels: ['phone'] })]))
      ),
      mixed,
      noEvents
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Record consent for Email' }))
    await screen.findByText(/No Consent Wording covers Email yet/)
    await portal.user.type(screen.getByLabelText('Evidence reference'), 'Note')
    await portal.user.click(screen.getByRole('button', { name: 'Record consent' }))
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
    expect(screen.queryByText(/Choose the Consent Wording/)).toBeNull()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/No Consent Wording covers Email yet/)
  })

  test('a Call reference is asked for only on a verbal grant, and is sent', async () => {
    const portal = visit(
      'rep',
      route('POST', GRANTS, json(201, { events: [consentEventBody(5)], consent: consentBody(1) })),
      mixed,
      noEvents,
      wordings
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Record consent for Phone' }))
    expect(screen.queryByLabelText('Call reference')).toBeNull()
    await choose(portal.user, screen.getByLabelText('Source'), 'verbal_call')
    await portal.user.type(screen.getByLabelText('Evidence reference'), 'Call notes')
    await portal.user.click(screen.getByRole('button', { name: 'Record consent' }))
    expect(await screen.findByText('Enter the Call this consent was given on.')).toBeTruthy()
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
    await portal.user.type(screen.getByLabelText('Call reference'), hexId('call', 7))
    await portal.user.click(screen.getByRole('button', { name: 'Record consent' }))
    await screen.findByText('Consent recorded on Phone.')
    const post = portal.calls.find((call) => call.method === 'POST' && call.path === GRANTS)
    expect(post?.body).toMatchObject({ source: 'verbal_call', callId: hexId('call', 7) })
  })

  test('refuses an empty evidence reference before anything is sent, and moves focus to it', async () => {
    const portal = visit('rep', mixed, noEvents, wordings)
    await portal.user.click(await screen.findByRole('button', { name: 'Record consent for Phone' }))
    await portal.user.click(screen.getByRole('button', { name: 'Record consent' }))
    const field = screen.getByLabelText('Evidence reference')
    expect(await screen.findByText(/Say where the evidence is kept/)).toBeTruthy()
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(field.getAttribute('aria-describedby')).toBeTruthy()
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
  })

  test('a Consent Wording that is gone is explained in words', async () => {
    const portal = visit(
      'rep',
      route('POST', GRANTS, failure(404, CONSENT_ERRORS['consent.not_found'].code)),
      mixed,
      noEvents,
      wordings
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Record consent for Phone' }))
    await portal.user.type(screen.getByLabelText('Evidence reference'), 'Call notes')
    await portal.user.click(screen.getByRole('button', { name: 'Record consent' }))
    expect(await screen.findByText(/no longer exists. Reload the page/)).toBeTruthy()
  })

  test('a Prospect that is gone is explained in words', async () => {
    const portal = visit(
      'rep',
      route('POST', GRANTS, failure(404, PROSPECT_ERRORS['prospect.not_found'].code)),
      mixed,
      noEvents,
      wordings
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Record consent for Phone' }))
    await portal.user.type(screen.getByLabelText('Evidence reference'), 'Call notes')
    await portal.user.click(screen.getByRole('button', { name: 'Record consent' }))
    expect(await screen.findByText(/That Prospect no longer exists/)).toBeTruthy()
  })
})

describe('Contact Consent: withdrawing', () => {
  test('withdraws one channel after a confirmation', async () => {
    const portal = visit(
      'rep',
      route(
        'POST',
        WITHDRAWALS,
        json(201, { events: [withdrawalEventBody(6)], consent: consentBody(1) })
      ),
      mixed,
      noEvents,
      wordings
    )
    await portal.user.click(
      await screen.findByRole('button', { name: 'Withdraw consent for Phone' })
    )
    expect(portal.calls.some((call) => call.path === WITHDRAWALS)).toBe(false)
    await portal.user.click(screen.getByRole('button', { name: 'Withdraw consent' }))
    await screen.findByText('Consent withdrawn on Phone.')
    const post = portal.calls.find((call) => call.method === 'POST' && call.path === WITHDRAWALS)
    expect(post?.body).toEqual({ channels: ['phone'] })
    expect(post?.headers.get('idempotency-key')).toMatch(/^[A-Za-z0-9_.:-]{16,128}$/)
    expect(
      portal.calls.filter((c) => c.method === 'GET' && c.path === CONSENT).length
    ).toBeGreaterThan(1)
  })

  test('only a channel with consent can be withdrawn', async () => {
    visit('rep', mixed, noEvents, wordings)
    await screen.findByRole('heading', { name: 'Phone' })
    expect(screen.getByRole('button', { name: 'Withdraw consent for Phone' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Withdraw consent for Text message' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Withdraw consent for Email' })).toBeNull()
  })

  test('withdraws every channel at once', async () => {
    const portal = visit(
      'rep',
      route(
        'POST',
        WITHDRAWALS,
        json(201, { events: [withdrawalEventBody(6)], consent: consentBody(1) })
      ),
      mixed,
      noEvents,
      wordings
    )
    await portal.user.click(
      await screen.findByRole('button', { name: 'Withdraw consent on every channel' })
    )
    await portal.user.click(screen.getByRole('button', { name: 'Withdraw all consent' }))
    await screen.findByText('Consent withdrawn on every channel.')
    const post = portal.calls.find((call) => call.method === 'POST' && call.path === WITHDRAWALS)
    expect(post?.body).toEqual({ all: true })
  })

  test('a failed withdrawal is explained beside the control', async () => {
    const portal = visit(
      'rep',
      route('POST', WITHDRAWALS, failure(404, PROSPECT_ERRORS['prospect.not_found'].code)),
      mixed,
      noEvents,
      wordings
    )
    await portal.user.click(
      await screen.findByRole('button', { name: 'Withdraw consent for Phone' })
    )
    await portal.user.click(screen.getByRole('button', { name: 'Withdraw consent' }))
    expect(await screen.findByText(/That Prospect no longer exists/)).toBeTruthy()
  })
})

describe('Contact Consent: accessibility', () => {
  test('passes axe in light and dark with the record form open', async () => {
    const portal = visit(
      'rep',
      mixed,
      wordings,
      route('GET', EVENTS, json(200, page([consentEventBody(1)])))
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Record consent for Phone' }))
    await screen.findByRole('list', { name: 'Consent evidence' })
    const run = async () =>
      (
        await axe.run(screen.getByRole('main'), { rules: { 'color-contrast': { enabled: false } } })
      ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
    expect(await run()).toEqual([])
    document.documentElement.classList.add('dark')
    expect(await run()).toEqual([])
  })
})
