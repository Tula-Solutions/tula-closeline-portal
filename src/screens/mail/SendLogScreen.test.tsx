import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { mailId, queryOf } from '~/screens/mail/mail-fixtures'
import { failure, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const SENDS = '/v1/mail/sends'
const NOW = '2026-10-01T10:00:00.000Z'
const send = (n: number, changes: Record<string, unknown> = {}) => ({
  id: mailId('snd', n),
  campaignId: mailId('cpg', 1),
  enrollmentId: mailId('enr', n),
  prospectId: mailId('prs', n),
  step: 1,
  attemptEpoch: 1,
  mailboxId: mailId('mbx', 1),
  state: 'sent',
  reason: null,
  checks: [{ check: 'consent', passed: true }],
  retryAt: null,
  decidedAt: NOW,
  sentAt: NOW,
  ...changes,
})
const page = (...items: unknown[]) => route('GET', SENDS, json(200, { items, nextCursor: null }))

function visit(url: string, handlers: ReturnType<typeof page>[]) {
  return renderPortal({
    url,
    signedIn: tokens({ organization: { id: 'org_1', role: 'rep' } }),
    handlers,
  })
}

afterEach(cleanup)

describe('Send log', () => {
  test('a refused send says why in plain words, and a held one says when it is tried again', async () => {
    visit('/mail/sends', [
      page(
        send(1, {
          state: 'refused',
          reason: 'no_consent',
          sentAt: null,
          checks: [{ check: 'consent', passed: false }],
        }),
        send(2, {
          state: 'deferred',
          reason: 'limit_reached',
          sentAt: null,
          retryAt: '2026-10-02T09:00:00.000Z',
        })
      ),
    ])
    expect(
      await screen.findByText('There is no Contact Consent to email this Prospect.')
    ).toBeTruthy()
    expect(screen.getByText('consent: not passed')).toBeTruthy()
    expect(screen.getAllByText('Held back').length).toBe(2)
    expect(screen.getByText('The Mailbox hit its limit. It is tried again later.')).toBeTruthy()
    expect(screen.getByText(/Next try/)).toBeTruthy()
  })

  test('the address filter reaches the service, and filtering again updates the address', async () => {
    const campaign = mailId('cpg', 1)
    const portal = visit(`/mail/sends?campaignId=${campaign}`, [page(send(1))])
    await screen.findByText('Sent')
    const first = portal.calls.find((call) => call.path === SENDS)
    expect(first && queryOf(first).campaignId).toBe(campaign)
    const prospect = mailId('prs', 1)
    await portal.user.type(screen.getByLabelText('Prospect id'), prospect)
    await portal.user.click(screen.getByRole('button', { name: 'Filter' }))
    await waitFor(() =>
      expect(portal.router.state.location.search).toMatchObject({
        campaignId: campaign,
        prospectId: prospect,
      })
    )
  })

  test('an empty log says so', async () => {
    visit('/mail/sends', [page()])
    expect(await screen.findByText('No sends match.')).toBeTruthy()
  })

  test('a failed read shows words, not service text', async () => {
    visit('/mail/sends', [route('GET', SENDS, failure(503, 'service.unavailable'))])
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('Text the portal never shows.')).toBeNull()
  })

  test('has no axe violations', async () => {
    visit('/mail/sends', [
      page(send(1), send(2, { state: 'refused', reason: 'suppressed', sentAt: null })),
    ])
    await screen.findAllByText('Refused')
    const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
    expect(result.violations.map((v) => v.id)).toEqual([])
  })
})
