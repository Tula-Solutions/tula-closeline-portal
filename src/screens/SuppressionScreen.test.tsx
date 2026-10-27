import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { CONSENT_ERRORS } from 'tula-closeline-contract'
import { hexId, page, suppressionBody, teamBody } from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'
import { choose } from '~/testing/select'

const ENTRIES = '/v1/suppression-entries'
const LOOKUPS = '/v1/suppression-entries/lookups'
const removal = (n: number) => `${ENTRIES}/${hexId('sup', n)}/removal`

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', url: string, ...handlers: Handler[]) {
  return renderPortal({
    url,
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers,
  })
}

const entries = route(
  'GET',
  ENTRIES,
  json(
    200,
    page([
      suppressionBody(1, { maskedAddress: 'p***n@example.com', reason: 'manual', removable: true }),
      suppressionBody(2, {
        maskedAddress: '+1415***0100',
        addressKind: 'phone',
        reason: 'stop',
        removable: false,
      }),
      suppressionBody(3, { maskedAddress: 'b***@example.com', reason: 'bounce', removable: false }),
    ])
  )
)
const teamsList = route('GET', '/v1/teams', json(200, page([teamBody(1, 'Northern')])))

afterEach(() => {
  document.documentElement.classList.remove('dark')
  cleanup()
})

describe('Suppression: who may see it', () => {
  test.each(['manager', 'rep'] as const)(
    'a %s sees a notice, no entries, and nothing is requested',
    async (role) => {
      const portal = visit(role, '/suppression', entries)
      expect(await screen.findByText(/Only an Owner or Admin can manage Suppression/)).toBeTruthy()
      expect(screen.queryByRole('list', { name: 'Suppression entries' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Add to Suppression' })).toBeNull()
      expect(portal.calls.some((call) => call.path.startsWith(ENTRIES))).toBe(false)
    }
  )

  test.each(['manager', 'rep'] as const)('the nav link is hidden from a %s', async (role) => {
    visit(role, '/teams', teamsList)
    await screen.findByRole('list', { name: 'Teams' })
    expect(screen.queryByRole('link', { name: 'Suppression' })).toBeNull()
  })

  test.each(['owner', 'admin'] as const)('the nav link is shown to an %s', async (role) => {
    visit(role, '/teams', teamsList)
    await screen.findByRole('list', { name: 'Teams' })
    expect(screen.getByRole('link', { name: 'Suppression' })).toBeTruthy()
  })
})

describe('Suppression: the list', () => {
  test('shows each entry masked, with its reason, and offers removal only for a manual one', async () => {
    visit('admin', '/suppression', entries)
    const list = await screen.findByRole('list', { name: 'Suppression entries' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows[0]?.textContent).toContain('p***n@example.com')
    expect(rows[0]?.textContent).toContain('Added by hand')
    expect(rows[1]?.textContent).toContain('+1415***0100')
    expect(rows[1]?.textContent).toContain('Replied STOP')
    expect(rows[2]?.textContent).toContain('Bounced')
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Remove p***n@example.com' })).toBeTruthy()
  })

  test('loads a page at a time', async () => {
    const portal = visit(
      'owner',
      '/suppression',
      route('GET', ENTRIES, (call) =>
        new URL(call.url, 'http://x').searchParams.get('cursor') === 'c2'
          ? json(200, page([suppressionBody(5, { maskedAddress: 'fifth@example.com' })]))
          : json(200, page([suppressionBody(1)], 'c2'))
      )
    )
    await screen.findByRole('list', { name: 'Suppression entries' })
    await portal.user.click(screen.getByRole('button', { name: 'Load more Suppression entries' }))
    await screen.findByText('fifth@example.com')
    expect(portal.calls.filter((call) => call.path === ENTRIES)[0]?.url).toContain('limit=25')
  })

  test('says when there are none', async () => {
    visit('owner', '/suppression', route('GET', ENTRIES, json(200, page([]))))
    expect(await screen.findByText('Nothing is on Suppression.')).toBeTruthy()
  })

  test('filters by reason, address type and state, asking again each time', async () => {
    const portal = visit('admin', '/suppression', entries)
    await screen.findByRole('list', { name: 'Suppression entries' })
    await choose(portal.user, screen.getByLabelText('Reason'), 'bounce')
    await choose(portal.user, screen.getByLabelText('Address type'), 'email')
    await choose(portal.user, screen.getByLabelText('Show'), 'removed')
    await waitFor(() => {
      const last = portal.calls.filter((call) => call.path === ENTRIES).at(-1)
      const params = new URL(last?.url ?? '', 'http://x').searchParams
      expect(params.get('reason')).toBe('bounce')
      expect(params.get('addressKind')).toBe('email')
      expect(params.get('state')).toBe('removed')
    })
  })

  test('a removed entry shows who removed it and why, and cannot be removed again', async () => {
    visit(
      'admin',
      '/suppression',
      route(
        'GET',
        ENTRIES,
        json(
          200,
          page([
            suppressionBody(1, {
              removable: true,
              removedAt: '2026-10-05T09:00:00Z',
              removalReason: 'Asked to be added back <b>by phone</b>',
            }),
          ])
        )
      )
    )
    const list = await screen.findByRole('list', { name: 'Suppression entries' })
    expect(list.textContent).toContain('Removed')
    expect(list.textContent).toContain('Asked to be added back <b>by phone</b>')
    expect(list.querySelector('b')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull()
  })
})

describe('Suppression: adding by hand', () => {
  test('sends the address and note with one idempotency key, then refreshes', async () => {
    const portal = visit(
      'admin',
      '/suppression',
      route('POST', ENTRIES, json(201, suppressionBody(9, { maskedAddress: 'n***e@example.com' }))),
      entries
    )
    await screen.findByRole('list', { name: 'Suppression entries' })
    await portal.user.type(screen.getByLabelText('Address'), '  nobody@example.com ')
    await portal.user.type(screen.getByLabelText('Note (optional)'), 'Asked by email')
    await portal.user.click(screen.getByRole('button', { name: 'Add to Suppression' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Added to Suppression.')
    )
    const post = portal.calls.find((call) => call.method === 'POST' && call.path === ENTRIES)
    expect(post?.body).toEqual({ email: 'nobody@example.com', note: 'Asked by email' })
    expect(post?.headers.get('idempotency-key')).toMatch(/^[A-Za-z0-9_.:-]{16,128}$/)
    expect(
      portal.calls.filter((call) => call.method === 'GET' && call.path === ENTRIES).length
    ).toBeGreaterThan(1)
  })

  test('sends a phone number or a LinkedIn address under the right name', async () => {
    const portal = visit(
      'admin',
      '/suppression',
      route('POST', ENTRIES, json(201, suppressionBody(9))),
      entries
    )
    await screen.findByRole('list', { name: 'Suppression entries' })
    await choose(portal.user, screen.getByLabelText('Type of address to add'), 'phone')
    await portal.user.type(screen.getByLabelText('Address'), '+14155550100')
    await portal.user.click(screen.getByRole('button', { name: 'Add to Suppression' }))
    await screen.findByText('Added to Suppression.')
    expect(portal.calls.find((call) => call.method === 'POST')?.body).toEqual({
      phone: '+14155550100',
    })
  })

  test('refuses an empty address before anything is sent, and ties the error to the field', async () => {
    const portal = visit('admin', '/suppression', entries)
    await screen.findByRole('list', { name: 'Suppression entries' })
    await portal.user.click(screen.getByRole('button', { name: 'Add to Suppression' }))
    const field = screen.getByLabelText('Address')
    expect(await screen.findByText(/Enter the address to suppress/)).toBeTruthy()
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(field.getAttribute('aria-describedby')).toBeTruthy()
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
  })

  test('a server refusal of the address is shown in the form', async () => {
    const portal = visit(
      'admin',
      '/suppression',
      route('POST', ENTRIES, failure(422, 'request.invalid')),
      entries
    )
    await screen.findByRole('list', { name: 'Suppression entries' })
    await portal.user.type(screen.getByLabelText('Address'), 'nobody@example.com')
    await portal.user.click(screen.getByRole('button', { name: 'Add to Suppression' }))
    expect(await screen.findByText('Check the details you entered and try again.')).toBeTruthy()
  })
})

describe('Suppression: checking an address', () => {
  test('posts the address to the lookup, never in the URL, and shows what is found', async () => {
    const portal = visit(
      'admin',
      '/suppression',
      route(
        'POST',
        LOOKUPS,
        json(200, page([suppressionBody(1, { reason: 'complaint', removable: false })]))
      ),
      entries
    )
    await screen.findByRole('list', { name: 'Suppression entries' })
    await portal.user.type(screen.getByLabelText('Address to check'), 'someone@example.com')
    await portal.user.click(screen.getByRole('button', { name: 'Check address' }))
    const result = await screen.findByRole('region', { name: 'Result of the check' })
    expect(result.textContent).toContain('Complained')
    const post = portal.calls.find((call) => call.path === LOOKUPS)
    expect(post?.body).toEqual({ email: 'someone@example.com' })
    expect(portal.calls.every((call) => !call.url.includes('someone'))).toBe(true)
  })

  test('says when the address is not on Suppression', async () => {
    const portal = visit(
      'admin',
      '/suppression',
      route('POST', LOOKUPS, json(200, page([]))),
      entries
    )
    await screen.findByRole('list', { name: 'Suppression entries' })
    await portal.user.type(screen.getByLabelText('Address to check'), 'someone@example.com')
    await portal.user.click(screen.getByRole('button', { name: 'Check address' }))
    expect(await screen.findByText('That address is not on Suppression.')).toBeTruthy()
  })
})

describe('Suppression: removing a manual entry', () => {
  test('asks for a reason, sends it, and refreshes the list', async () => {
    const portal = visit(
      'admin',
      '/suppression',
      route(
        'POST',
        removal(1),
        json(200, suppressionBody(1, { removedAt: '2026-10-06T09:00:00Z' }))
      ),
      entries
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Remove p***n@example.com' }))
    await portal.user.type(screen.getByLabelText('Reason for removing'), 'Added by mistake')
    await portal.user.click(screen.getByRole('button', { name: 'Remove entry' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Removed from Suppression.')
    )
    const post = portal.calls.find((call) => call.path === removal(1))
    expect(post?.body).toEqual({ reason: 'Added by mistake' })
    expect(
      portal.calls.filter((call) => call.method === 'GET' && call.path === ENTRIES).length
    ).toBeGreaterThan(1)
  })

  test('clears the result of an earlier check once the list changes', async () => {
    const portal = visit(
      'admin',
      '/suppression',
      route('POST', LOOKUPS, json(200, page([suppressionBody(1, { reason: 'manual' })]))),
      route(
        'POST',
        removal(1),
        json(200, suppressionBody(1, { removedAt: '2026-10-06T09:00:00Z' }))
      ),
      entries
    )
    await screen.findByRole('list', { name: 'Suppression entries' })
    await portal.user.type(screen.getByLabelText('Address to check'), 'p1@example.com')
    await portal.user.click(screen.getByRole('button', { name: 'Check address' }))
    await screen.findByRole('region', { name: 'Result of the check' })
    await portal.user.click(screen.getByRole('button', { name: 'Remove p***n@example.com' }))
    await portal.user.type(screen.getByLabelText('Reason for removing'), 'Added by mistake')
    await portal.user.click(screen.getByRole('button', { name: 'Remove entry' }))
    await screen.findByText('Removed from Suppression.')
    expect(
      screen
        .queryAllByRole('region')
        .some((region) => region.getAttribute('aria-label') === 'Result of the check')
    ).toBe(false)
  })

  test('refuses an empty reason before anything is sent', async () => {
    const portal = visit('admin', '/suppression', entries)
    await portal.user.click(await screen.findByRole('button', { name: 'Remove p***n@example.com' }))
    await portal.user.click(screen.getByRole('button', { name: 'Remove entry' }))
    expect(await screen.findByText(/Say why this entry is being removed/)).toBeTruthy()
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
  })

  test('Cancel closes the form without a request', async () => {
    const portal = visit('admin', '/suppression', entries)
    await portal.user.click(await screen.findByRole('button', { name: 'Remove p***n@example.com' }))
    await portal.user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Reason for removing')).toBeNull()
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
  })

  test('an entry that cannot be removed is explained beside the row', async () => {
    const portal = visit(
      'admin',
      '/suppression',
      route('POST', removal(1), failure(409, CONSENT_ERRORS['consent.entry_not_removable'].code)),
      entries
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Remove p***n@example.com' }))
    await portal.user.type(screen.getByLabelText('Reason for removing'), 'Added by mistake')
    await portal.user.click(screen.getByRole('button', { name: 'Remove entry' }))
    expect(await screen.findByText(/Only an entry added by hand can be removed/)).toBeTruthy()
  })

  test('an entry that is gone is explained beside the row', async () => {
    const portal = visit(
      'admin',
      '/suppression',
      route('POST', removal(1), failure(404, CONSENT_ERRORS['consent.not_found'].code)),
      entries
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Remove p***n@example.com' }))
    await portal.user.type(screen.getByLabelText('Reason for removing'), 'Added by mistake')
    await portal.user.click(screen.getByRole('button', { name: 'Remove entry' }))
    expect(await screen.findByText(/no longer exists/)).toBeTruthy()
  })
})

describe('Suppression: accessibility', () => {
  test('passes axe in light and dark with the removal form open', async () => {
    const portal = visit('admin', '/suppression', entries)
    await portal.user.click(await screen.findByRole('button', { name: 'Remove p***n@example.com' }))
    const run = async () =>
      (
        await axe.run(screen.getByRole('main'), { rules: { 'color-contrast': { enabled: false } } })
      ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
    expect(await run()).toEqual([])
    document.documentElement.classList.add('dark')
    expect(await run()).toEqual([])
  })
})
