import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import { ENRICHMENT_ERRORS } from 'tula-closeline-contract'
import { page, prospectBody } from '~/testing/core-bodies'
import {
  budgetBody,
  criterionBody,
  enrichmentBody,
  fieldBody,
  fitBody,
  prospectId,
  providerBody,
  runBody,
  runSetBody,
  waterfallBody,
} from '~/testing/enrichment-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const ONE = `/v1/prospects/${prospectId(1)}`
const RUNS = '/v1/enrichment-runs'

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', url: string, ...handlers: Handler[]) {
  return renderPortal({
    url,
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers,
  })
}

/** The reads of the Prospect page that do not change in these tests. */
const prospectPage = [
  route('GET', ONE, json(200, prospectBody(1))),
  route('GET', `${ONE}/signals`, json(200, page([]))),
  route('GET', `${ONE}/fit`, json(200, fitBody())),
]

afterEach(() => cleanup())

describe('Enrichment panel', () => {
  test('Enrich shows provenance, time and cost without a reload', async () => {
    let enriched = false
    const portal = visit(
      'rep',
      `/prospects/${prospectId(1)}`,
      ...prospectPage,
      route('GET', `${ONE}/enrichment`, () =>
        json(200, enrichmentBody(enriched ? [fieldBody()] : []))
      ),
      route('GET', RUNS, () => json(200, page(enriched ? [runBody()] : []))),
      route('POST', RUNS, () => {
        enriched = true
        return json(202, runSetBody())
      })
    )
    await screen.findByText(/Nothing has been enriched yet/)
    await portal.user.click(screen.getByRole('button', { name: 'Enrich' }))
    const table = await screen.findByRole('table', { name: 'Enriched fields' })
    const row = within(table).getByRole('row', { name: /Job title/ })
    expect(row.textContent).toContain('VP of Sales')
    expect(row.textContent).toContain('apollo')
    expect(row.textContent).toContain('90%')
    expect(row.textContent).toContain('$0.02')
    expect(screen.getByText(/Total cost:/).textContent).toContain('$0.02')
    const post = portal.calls.find((call) => call.method === 'POST')
    expect(post?.headers.get('Idempotency-Key')).toBeTruthy()
  })

  test('budget exhaustion shows its reason, not a generic error', async () => {
    const portal = visit(
      'rep',
      `/prospects/${prospectId(1)}`,
      ...prospectPage,
      route('GET', `${ONE}/enrichment`, json(200, enrichmentBody())),
      route('GET', RUNS, json(200, page([]))),
      route('POST', RUNS, failure(429, ENRICHMENT_ERRORS['enrichment.budget_exceeded'].code))
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Enrich' }))
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('alert')
          .some((a) => /enrichment budget is spent/.test(a.textContent ?? ''))
      ).toBe(true)
    )
  })

  test('a stopped run says why it stopped', async () => {
    visit(
      'rep',
      `/prospects/${prospectId(1)}`,
      ...prospectPage,
      route('GET', `${ONE}/enrichment`, json(200, enrichmentBody([fieldBody()]))),
      route(
        'GET',
        RUNS,
        json(200, page([runBody({ status: 'stopped', stopReason: 'monthly_budget' })]))
      )
    )
    expect(await screen.findByText(/enrichment\.budget_exceeded/)).toBeTruthy()
  })

  test('the Fit explanation lists each criterion with its result', async () => {
    visit(
      'rep',
      `/prospects/${prospectId(1)}`,
      ...prospectPage,
      route('GET', `${ONE}/enrichment`, json(200, enrichmentBody())),
      route('GET', RUNS, json(200, page([])))
    )
    const list = await screen.findByRole('list', { name: 'Why this score' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(list.textContent).toContain('Sales leader')
    expect(screen.getByText(/40 of 60/)).toBeTruthy()
  })
})

describe('Bulk Enrich', () => {
  test('asks first, then sends the listed Prospects and follows the progress', async () => {
    const portal = visit(
      'rep',
      '/prospects',
      route('GET', '/v1/prospects', json(200, page([prospectBody(1)]))),
      route('GET', '/v1/prospect-companies', json(200, page([]))),
      route('GET', '/v1/members', json(200, page([]))),
      route(
        'POST',
        RUNS,
        json(
          202,
          runSetBody({
            done: false,
            counts: { queued: 0, running: 1, complete: 0, incomplete: 0, stopped: 0 },
          })
        )
      ),
      route('GET', `/v1/enrichment-run-sets/${runSetBody().id}`, json(200, runSetBody()))
    )
    await portal.user.click(
      await screen.findByRole('button', { name: 'Enrich the Prospects on this page' })
    )
    expect(portal.calls.some((call) => call.method === 'POST' && call.path === RUNS)).toBe(false)
    await portal.user.click(screen.getByRole('button', { name: 'Enrich' }))
    await waitFor(() => {
      const post = portal.calls.find((call) => call.method === 'POST' && call.path === RUNS)
      expect(post?.body).toEqual({ prospectIds: [prospectId(1)] })
    })
    await waitFor(() => expect(screen.getByRole('status').textContent ?? '').toMatch(/1/))
  })
})

describe('Enrichment settings', () => {
  const settingsReads = [
    route('GET', '/v1/enrichment/providers', json(200, page([providerBody('apollo')]))),
    route('GET', '/v1/enrichment/waterfall', json(200, waterfallBody())),
    route('GET', '/v1/enrichment/budget', json(200, budgetBody())),
    route('GET', '/v1/enrichment/spend', json(200, page([]))),
    route('GET', '/v1/fit-criteria', json(200, { ...page([]), criteriaVersion: 1 })),
  ]

  test.each(['manager', 'rep'] as const)(
    'a %s sees a notice and nothing is requested',
    async (role) => {
      const portal = visit(role, '/enrichment', ...settingsReads)
      expect(await screen.findByText(/Only an Owner or Admin can change enrichment/)).toBeTruthy()
      expect(portal.calls.some((call) => call.path.startsWith('/v1/enrichment'))).toBe(false)
      expect(screen.queryByRole('link', { name: 'Enrichment' })).toBeNull()
    }
  )

  test('an Owner sees the page and the nav link', async () => {
    visit('owner', '/enrichment', ...settingsReads)
    expect(await screen.findByRole('form', { name: 'apollo' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Enrichment' })).toBeTruthy()
  })

  test('a saved key is never shown, is sent once, and the box is cleared', async () => {
    const portal = visit(
      'admin',
      '/enrichment',
      route('PUT', '/v1/enrichment/providers/apollo', json(200, providerBody('apollo'))),
      ...settingsReads
    )
    const form = await screen.findByRole('form', { name: 'apollo' })
    expect(within(form).getByText(/Key set/)).toBeTruthy()
    const key = within(form).getByLabelText('Key for apollo') as HTMLInputElement
    expect(key.type).toBe('password')
    expect(key.value).toBe('')
    await portal.user.type(key, 'sk-test-12345678')
    await portal.user.click(within(form).getByRole('button', { name: 'Save apollo' }))
    await waitFor(() => {
      const put = portal.calls.find((call) => call.method === 'PUT')
      expect(put?.body).toEqual({ enabled: true, apiKey: 'sk-test-12345678' })
      expect(put?.headers.get('Idempotency-Key')).toBeTruthy()
    })
    await waitFor(() => expect(key.value).toBe(''))
    expect(document.body.textContent).not.toContain('sk-test-12345678')
  })

  test('a stale budget is reported as a conflict', async () => {
    const portal = visit(
      'owner',
      '/enrichment',
      route(
        'PUT',
        '/v1/enrichment/budget',
        failure(409, ENRICHMENT_ERRORS['enrichment.version_conflict'].code)
      ),
      ...settingsReads
    )
    const form = await screen.findByRole('form', { name: 'Budget' })
    await portal.user.click(within(form).getByRole('button', { name: 'Save budget' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Someone else changed this/)
    const put = portal.calls.find((call) => call.method === 'PUT')
    expect(put?.body).toMatchObject({ expectedVersion: 1 })
    expect(put?.headers.get('Idempotency-Key')).toBeTruthy()
  })

  test('a run limit above the monthly limit is refused before any request', async () => {
    const portal = visit('owner', '/enrichment', ...settingsReads)
    const form = await screen.findByRole('form', { name: 'Budget' })
    const ceiling = within(form).getByLabelText('Limit for one run (dollars)')
    await portal.user.clear(ceiling)
    await portal.user.type(ceiling, '900')
    await portal.user.click(within(form).getByRole('button', { name: 'Save budget' }))
    expect(await within(form).findByText(/cannot be more than the monthly limit/)).toBeTruthy()
    expect(portal.calls.some((call) => call.method === 'PUT')).toBe(false)
  })

  test('the provider order can be moved with the keyboard-reachable buttons and is saved with its version', async () => {
    const portal = visit(
      'owner',
      '/enrichment',
      route('PUT', '/v1/enrichment/waterfall', json(200, waterfallBody(2))),
      ...settingsReads
    )
    await portal.user.click(
      await screen.findByRole('button', { name: 'Move exa search up in Person' })
    )
    await portal.user.click(screen.getByRole('button', { name: 'Save order' }))
    await waitFor(() => {
      const put = portal.calls.find(
        (call) => call.path === '/v1/enrichment/waterfall' && call.method === 'PUT'
      )
      expect(put?.body).toMatchObject({
        expectedVersion: 1,
        order: { person: ['exa_search', 'apollo'] },
      })
      expect(put?.headers.get('Idempotency-Key')).toBeTruthy()
    })
  })

  test('Fit Criterion changes each send an Idempotency-Key', async () => {
    const criterion = criterionBody()
    const portal = visit(
      'owner',
      '/enrichment',
      route('PATCH', `/v1/fit-criteria/${criterion.id}`, json(200, criterion)),
      route('DELETE', `/v1/fit-criteria/${criterion.id}`, json(204, null)),
      route('GET', '/v1/fit-criteria', json(200, { ...page([criterion]), criteriaVersion: 1 })),
      ...settingsReads.filter((r) => r !== settingsReads[4])
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Turn off' }))
    await waitFor(() => {
      const patch = portal.calls.find((call) => call.method === 'PATCH')
      expect(patch?.headers.get('Idempotency-Key')).toBeTruthy()
    })
    await portal.user.click(screen.getByRole('button', { name: /Delete the criterion/ }))
    await portal.user.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      const del = portal.calls.find((call) => call.method === 'DELETE')
      expect(del?.headers.get('Idempotency-Key')).toBeTruthy()
    })
  })
})
