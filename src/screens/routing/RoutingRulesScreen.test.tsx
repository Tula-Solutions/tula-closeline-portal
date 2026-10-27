import { describe, expect, test } from 'bun:test'
import { screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { BOOKING_ERRORS } from 'tula-closeline-contract'
import {
  hexId,
  memberBody,
  page,
  routingResultBody,
  routingRuleBody,
  teamBody,
} from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'
import { choose } from '~/testing/select'

const RULES = '/v1/routing-rules'
const one = (n: number) => `${RULES}/${hexId('rrl', n)}`

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', url: string, ...handlers: Handler[]) {
  return renderPortal({
    url,
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers: [
      route('GET', '/v1/members', json(200, page([memberBody(1, { name: 'Ada Rep' })]))),
      route('GET', '/v1/teams', json(200, page([teamBody(1, 'North')]))),
      route('GET', '/v1/booking-types', json(200, page([]))),
      ...handlers,
    ],
  })
}

const list = route(
  'GET',
  RULES,
  json(
    200,
    page([
      routingRuleBody(1),
      routingRuleBody(2, { name: 'Second' }),
      routingRuleBody(3, { name: 'Default', isDefault: true }),
    ])
  )
)

type Portal = ReturnType<typeof visit>

/** Fills the add form with a valid rule: a name, a country, and a Team as the target. */
async function fillValid(portal: Portal, name: string) {
  await portal.user.type(await screen.findByLabelText('Name'), name)
  await portal.user.type(screen.getByLabelText('Countries'), 'de, fr')
  await choose(portal.user, screen.getByLabelText('Target'), 'A Team, in turn')
  await choose(portal.user, await screen.findByLabelText('Team'), 'North')
}

describe('Routing rules: who may see them', () => {
  test('a Rep sees a notice, no rules, and nothing is requested', async () => {
    const portal = visit('rep', '/routing', list)
    expect(
      await screen.findByText(/Only an Owner, Admin or Manager can see Routing Rules/)
    ).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Routing Rules' })).toBeNull()
    expect(portal.calls.some((call) => call.path.startsWith(RULES))).toBe(false)
  })

  test('the nav link is hidden from a Rep', async () => {
    visit('rep', '/teams')
    await screen.findByRole('heading', { name: 'Teams' })
    expect(screen.queryByRole('link', { name: 'Routing' })).toBeNull()
  })

  test.each(['owner', 'admin', 'manager'] as const)(
    'the nav link is shown to a %s',
    async (role) => {
      visit(role, '/teams')
      await screen.findByRole('heading', { name: 'Teams' })
      expect(screen.getByRole('link', { name: 'Routing' })).toBeTruthy()
    }
  )

  test('a Manager sees every rule but has no way to reorder', async () => {
    visit('manager', '/routing', list)
    const items = await screen.findByRole('list', { name: 'Routing Rules' })
    expect(within(items).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /^Move / })).toBeNull()
    expect(screen.getByText(/An Owner or Admin sets Booking Type conditions/)).toBeTruthy()
  })

  test('a Manager changing another Team rule is told it is not theirs', async () => {
    const portal = visit(
      'manager',
      '/routing',
      route('PUT', one(1), failure(404, BOOKING_ERRORS['routing.rule_not_found'].code)),
      list
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Edit Rule 1' }))
    await portal.user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText(/it is not yours to change/)).toBeTruthy()
  })
})

describe('Routing rules: the list', () => {
  test('lists the rules in the order they are tried, the default last', async () => {
    visit('admin', '/routing', list)
    const items = await screen.findByRole('list', { name: 'Routing Rules' })
    const names = within(items)
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent)
    expect(names).toEqual(['Rule 1', 'Second', 'Default'])
    expect(within(items).getByText(/Default, tried last/)).toBeTruthy()
  })

  test('says when there are none', async () => {
    visit('owner', '/routing', route('GET', RULES, json(200, page([]))))
    expect(await screen.findByText('There are no Routing Rules yet.')).toBeTruthy()
  })

  test('a name with markup is shown as isolated text', async () => {
    visit(
      'admin',
      '/routing',
      route('GET', RULES, json(200, page([routingRuleBody(1, { name: '<script>x</script>' })])))
    )
    const name = await screen.findByText('<script>x</script>')
    expect(document.querySelector('main script')).toBeNull()
    expect(name.tagName).toBe('BDI')
  })
})

describe('Routing rules: add', () => {
  test('adds one with an Idempotency-Key, announces it and refetches', async () => {
    const portal = visit(
      'admin',
      '/routing',
      route('POST', RULES, json(201, routingRuleBody(9))),
      list
    )
    await fillValid(portal, 'Europe')
    await portal.user.click(screen.getByRole('button', { name: 'Add rule' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Routing Rule added.'))
    const post = portal.calls.find((call) => call.method === 'POST')
    expect(post?.headers.get('idempotency-key')).toBeTruthy()
    expect(post?.body).toMatchObject({
      name: 'Europe',
      isDefault: false,
      conditions: { countries: ['DE', 'FR'] },
      target: { kind: 'team', teamId: hexId('team', 1) },
    })
    expect(
      portal.calls.filter((call) => call.method === 'GET' && call.path === RULES).length
    ).toBeGreaterThan(1)
  })

  test('a retry reuses the key; a changed body gets a new one', async () => {
    let posts = 0
    const portal = visit(
      'admin',
      '/routing',
      route('POST', RULES, () => {
        posts += 1
        if (posts <= 2) {
          throw new TypeError('network down')
        }
        return json(201, routingRuleBody(9))
      }),
      list
    )
    await fillValid(portal, 'Europe')
    const name = screen.getByLabelText('Name')
    await portal.user.click(screen.getByRole('button', { name: 'Add rule' }))
    await screen.findByRole('alert')
    await portal.user.click(screen.getByRole('button', { name: 'Add rule' }))
    await waitFor(() => expect(posts).toBe(2))
    await screen.findByRole('alert')
    await portal.user.type(name, ' two')
    await portal.user.click(screen.getByRole('button', { name: 'Add rule' }))
    await waitFor(() => expect(posts).toBe(3))
    const keys = portal.calls
      .filter((call) => call.method === 'POST')
      .map((call) => call.headers.get('idempotency-key'))
    expect(keys[1]).toBe(keys[0])
    expect(keys[2]).not.toBe(keys[0])
  })

  test('a missing name is a field error and nothing is sent', async () => {
    const portal = visit('admin', '/routing', list)
    await portal.user.click(await screen.findByRole('button', { name: 'Add rule' }))
    expect(await screen.findByText(/Enter a name/)).toBeTruthy()
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
  })

  test('routing.rule_invalid is worded by its code, not by the service text', async () => {
    const portal = visit(
      'admin',
      '/routing',
      route('POST', RULES, failure(422, BOOKING_ERRORS['routing.rule_invalid'].code)),
      list
    )
    await fillValid(portal, 'Europe')
    await portal.user.click(screen.getByRole('button', { name: 'Add rule' }))
    const alert = await screen.findByText(/Core did not accept that rule/)
    expect(alert.textContent).not.toContain('Text the portal never shows')
  })

  test('booking.type_not_found names the missing Booking Type', async () => {
    const portal = visit(
      'admin',
      '/routing',
      route('POST', RULES, failure(404, BOOKING_ERRORS['booking.type_not_found'].code)),
      list
    )
    await fillValid(portal, 'Europe')
    await portal.user.click(screen.getByRole('button', { name: 'Add rule' }))
    expect(await screen.findByText(/A Booking Type named there no longer exists/)).toBeTruthy()
  })
})

describe('Routing rules: edit and delete', () => {
  test('edits a rule with a PUT and refetches', async () => {
    const portal = visit(
      'owner',
      '/routing',
      route('PUT', one(1), json(200, routingRuleBody(1, { name: 'Renamed' }))),
      list
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Edit Rule 1' }))
    const form = screen.getByRole('form', { name: 'Edit Rule 1' })
    const name = within(form).getByLabelText('Name')
    await portal.user.clear(name)
    await portal.user.type(name, 'Renamed')
    await portal.user.click(within(form).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Routing Rule saved.'))
    expect(portal.calls.find((call) => call.method === 'PUT')?.body).toMatchObject({
      name: 'Renamed',
      isDefault: false,
      target: { kind: 'rep', membershipId: hexId('mem', 1) },
    })
    expect(screen.queryByRole('form', { name: 'Edit Rule 1' })).toBeNull()
  })

  test('deletes after a confirmation, and refetches', async () => {
    const portal = visit('admin', '/routing', route('DELETE', one(1), json(204, null)), list)
    await portal.user.click(await screen.findByRole('button', { name: 'Delete Rule 1' }))
    expect(portal.calls.some((call) => call.method === 'DELETE')).toBe(false)
    await portal.user.click(screen.getByRole('button', { name: 'Delete rule' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Routing Rule deleted.')
    )
    expect(portal.calls.some((call) => call.method === 'DELETE')).toBe(true)
  })
})

describe('Routing rules: reorder', () => {
  test('move down sends the new order, announces it, and keeps the default last', async () => {
    const portal = visit(
      'admin',
      '/routing',
      route('POST', `${RULES}/reorder`, json(200, page([]))),
      list
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Move Rule 1 down' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Moved Rule 1 down to position 2.')
    )
    expect(portal.calls.find((call) => call.path.endsWith('/reorder'))?.body).toEqual({
      ruleIds: [hexId('rrl', 2), hexId('rrl', 1), hexId('rrl', 3)],
    })
  })

  test('move up works from the second place', async () => {
    const portal = visit(
      'admin',
      '/routing',
      route('POST', `${RULES}/reorder`, json(200, page([]))),
      list
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Move Second up' }))
    await waitFor(() =>
      expect(portal.calls.some((call) => call.path.endsWith('/reorder'))).toBe(true)
    )
    expect(portal.calls.find((call) => call.path.endsWith('/reorder'))?.body).toEqual({
      ruleIds: [hexId('rrl', 2), hexId('rrl', 1), hexId('rrl', 3)],
    })
  })

  test('the first cannot go up, the one before the default cannot go down, the default cannot move', async () => {
    visit('admin', '/routing', list)
    await screen.findByRole('list', { name: 'Routing Rules' })
    const disabled = (name: string) =>
      (screen.getByRole('button', { name }) as HTMLButtonElement).disabled
    expect(disabled('Move Rule 1 up')).toBe(true)
    expect(disabled('Move Second down')).toBe(true)
    expect(disabled('Move Default up')).toBe(true)
    expect(disabled('Move Default down')).toBe(true)
    expect(disabled('Move Rule 1 down')).toBe(false)
  })
})

describe('Routing rules: try a sample Prospect', () => {
  test('shows the winning rule, the candidates in order and the skipped, as core gave them', async () => {
    const portal = visit(
      'admin',
      '/routing',
      route(
        'POST',
        `${RULES}/test`,
        json(
          200,
          routingResultBody({
            candidates: [
              { membershipId: hexId('mem', 1), reason: 'named_rep' },
              { membershipId: hexId('mem', 2), reason: 'round_robin_team' },
            ],
            skipped: [{ membershipId: hexId('mem', 3), reason: 'daily_cap_reached' }],
          })
        )
      ),
      list
    )
    await portal.user.type(await screen.findByLabelText('Sample country'), 'us')
    await portal.user.click(screen.getByRole('button', { name: 'Try sample' }))
    expect(await screen.findByText(/Winning rule:/)).toBeTruthy()
    const tried = screen.getByRole('list', { name: 'Reps tried, in order' })
    const entries = within(tried).getAllByRole('listitem')
    expect(entries).toHaveLength(2)
    expect(entries[0]?.textContent).toContain('named_rep')
    expect(entries[1]?.textContent).toContain('round_robin_team')
    const skipped = screen.getByRole('list', { name: 'Reps skipped' })
    expect(within(skipped).getByText('daily_cap_reached')).toBeTruthy()
    expect(portal.calls.find((call) => call.path.endsWith('/test'))?.body).toMatchObject({
      attributes: { country: 'US' },
    })
  })

  test('says so when no rule matched', async () => {
    const portal = visit(
      'admin',
      '/routing',
      route(
        'POST',
        `${RULES}/test`,
        json(200, routingResultBody({ matchedRuleId: null, candidates: [], skipped: [] }))
      ),
      list
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Try sample' }))
    expect(await screen.findByText('No rule matched this sample.')).toBeTruthy()
    expect(screen.getByText('Nobody would be tried.')).toBeTruthy()
  })
})

for (const theme of ['light', 'dark'] as const) {
  describe(`Routing rules: accessibility in ${theme}`, () => {
    test('has no axe violations', async () => {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
      }
      const portal = visit(
        'admin',
        '/routing',
        route('POST', `${RULES}/test`, json(200, routingResultBody())),
        list
      )
      await portal.user.click(await screen.findByRole('button', { name: 'Edit Rule 1' }))
      await screen.findByRole('form', { name: 'Edit Rule 1' })
      await portal.user.click(screen.getByRole('button', { name: 'Try sample' }))
      await screen.findByText(/Winning rule:/)
      const result = await axe.run(document.body, {
        rules: { 'color-contrast': { enabled: false } },
      })
      expect(result.violations.map((v) => v.id)).toEqual([])
      document.documentElement.classList.remove('dark')
    })
  })
}
