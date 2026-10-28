import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { hexId } from '~/testing/core-bodies'
import { failure, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const PATH = '/v1/copilot/settings'
const settings = (extra: Record<string, unknown> = {}) => ({
  enabled: false,
  minMoments: 3,
  minDeals: 2,
  updatedAt: '2026-10-01T10:00:00.000Z',
  updatedBy: hexId('mem', 1),
  ...extra,
})
const visit = (
  role: 'owner' | 'admin' | 'manager' | 'rep',
  ...handlers: ReturnType<typeof route>[]
) =>
  renderPortal({
    url: '/copilot-settings',
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers,
  })

afterEach(cleanup)

describe('Copilot settings', () => {
  test('a Rep reads the values and has no way to change them', async () => {
    const portal = visit('rep', route('GET', PATH, json(200, settings())))
    expect(await screen.findByText('Off')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save settings' })).toBeNull()
    expect(screen.getByText(/Last changed/)).toBeTruthy()
    expect(portal.calls.every((call) => call.method === 'GET')).toBe(true)
  })

  test('an Admin turns it on and sets the minimums', async () => {
    const portal = visit(
      'admin',
      route('PUT', PATH, json(200, settings({ enabled: true, minMoments: 6, minDeals: 4 }))),
      route('GET', PATH, json(200, settings()))
    )
    await portal.user.click(await screen.findByRole('checkbox', { name: /Let Reps use/ }))
    fireEvent.change(screen.getByLabelText('Fewest Moments behind a card'), {
      target: { value: '6' },
    })
    fireEvent.change(screen.getByLabelText('Fewest won Deals behind a card'), {
      target: { value: '4' },
    })
    await portal.user.click(screen.getByRole('button', { name: 'Save settings' }))
    await screen.findByRole('button', { name: 'Save settings' })
    const put = portal.calls.find((call) => call.method === 'PUT')
    expect(put?.body).toEqual({ enabled: true, minMoments: 6, minDeals: 4 })
  })

  test('a Deals minimum above Moments is refused before sending, in the same words', async () => {
    const portal = visit('owner', route('GET', PATH, json(200, settings())))
    await screen.findByRole('checkbox', { name: /Let Reps use/ })
    fireEvent.change(screen.getByLabelText('Fewest won Deals behind a card'), {
      target: { value: '9' },
    })
    await portal.user.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByText(/no more Deals than Moments/)).toBeTruthy()
    expect(portal.calls.some((call) => call.method === 'PUT')).toBe(false)
  })

  test('the Saved confirmation survives the refetch after a save', async () => {
    const portal = visit(
      'admin',
      route('PUT', PATH, json(200, settings({ enabled: true }))),
      route('GET', PATH, json(200, settings({ enabled: true })))
    )
    await portal.user.click(await screen.findByRole('checkbox', { name: /Let Reps use/ }))
    await portal.user.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() =>
      expect(portal.calls.filter((c) => c.method === 'GET').length).toBeGreaterThan(1)
    )
    expect(screen.getByRole('button', { name: 'Save settings' }).hasAttribute('data-saved')).toBe(
      true
    )
  })

  test('words copilot.min_evidence_invalid from its code', async () => {
    const portal = visit(
      'owner',
      route('PUT', PATH, failure(422, 'copilot.min_evidence_invalid')),
      route('GET', PATH, json(200, settings()))
    )
    await screen.findByRole('checkbox', { name: /Let Reps use/ })
    fireEvent.change(screen.getByLabelText('Fewest won Deals behind a card'), {
      target: { value: '9' },
    })
    await portal.user.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByText(/no more Deals than Moments/)).toBeTruthy()
  })
})
