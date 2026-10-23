import { describe, expect, test } from 'bun:test'
import { screen, waitFor, within } from '@testing-library/react'
import { ERRORS, VOICE_ERRORS } from 'tula-closeline-contract'
import { hexId, lineBody, memberBody, page, teamBody } from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'
import { param } from '~/testing/sales'
import { choose, optionsOf } from '~/testing/select'

const LINES = '/v1/lines'
const TEAMS = '/v1/teams'
const MEMBERS = '/v1/members'

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', url: string, ...handlers: Handler[]) {
  return renderPortal({
    url,
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers,
  })
}

const teams = route(
  'GET',
  TEAMS,
  json(200, page([teamBody(1, 'Northern'), teamBody(2, 'Southern')]))
)
const members = route(
  'GET',
  MEMBERS,
  json(
    200,
    page([
      memberBody(1, { name: 'Maya Chen', role: 'rep' }),
      memberBody(2, { name: 'Omar Admin', role: 'admin' }),
    ])
  )
)
const lines = route(
  'GET',
  LINES,
  json(
    200,
    page([
      lineBody(1, { label: 'Main line' }),
      lineBody(2, { assignment: { kind: 'team', teamId: hexId('team', 1) } }),
      lineBody(3, { assignment: { kind: 'rep', membershipId: hexId('mem', 1) } }),
      lineBody(4, { state: 'released' }),
    ])
  )
)

describe('Lines: who may see them', () => {
  test.each(['manager', 'rep'] as const)(
    'a %s sees a notice, no Lines, and nothing is requested',
    async (role) => {
      const portal = visit(role, '/lines', lines, teams, members)
      expect(await screen.findByText(/Only an Owner or Admin can manage Lines/)).toBeTruthy()
      expect(screen.queryByRole('list', { name: 'Lines' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Add Line' })).toBeNull()
      expect(portal.calls.some((call) => call.path.startsWith(LINES))).toBe(false)
    }
  )

  test.each(['manager', 'rep'] as const)('the nav link is hidden from a %s', async (role) => {
    visit(role, '/teams', teams)
    await screen.findByRole('list', { name: 'Teams' })
    expect(screen.queryByRole('link', { name: 'Lines' })).toBeNull()
  })

  test.each(['owner', 'admin'] as const)('the nav link is shown to an %s', async (role) => {
    visit(role, '/teams', teams)
    await screen.findByRole('list', { name: 'Teams' })
    expect(screen.getByRole('link', { name: 'Lines' })).toBeTruthy()
  })
})

describe('Lines: the list', () => {
  test('lists Lines with their state and who answers, a page at a time', async () => {
    const portal = visit(
      'admin',
      '/lines',
      route('GET', LINES, (call) =>
        new URL(call.url, 'http://x').searchParams.get('cursor') === 'c2'
          ? json(200, page([lineBody(5, { label: 'Fifth' })]))
          : json(
              200,
              page(
                [
                  lineBody(1, { label: 'Main line' }),
                  lineBody(2, { assignment: { kind: 'team', teamId: hexId('team', 1) } }),
                  lineBody(3, { assignment: { kind: 'rep', membershipId: hexId('mem', 1) } }),
                ],
                'c2'
              )
            )
      ),
      teams,
      members
    )
    const list = await screen.findByRole('list', { name: 'Lines' })
    expect(within(list).getByText('+14155550001')).toBeTruthy()
    expect(within(list).getByText('Main line')).toBeTruthy()
    await within(list).findByText(/Northern/)
    await within(list).findByText(/Maya Chen/)
    await portal.user.click(screen.getByRole('button', { name: 'Load more Lines' }))
    await screen.findByText('Fifth')
    expect(portal.calls.filter((call) => call.path === LINES)[0]?.url).toBe('/v1/lines?limit=25')
    expect(portal.calls.filter((call) => call.path === LINES)[1]?.url).toContain('cursor=c2')
  })

  test('says when there are none', async () => {
    visit('owner', '/lines', route('GET', LINES, json(200, page([]))), teams, members)
    expect(await screen.findByText('There are no Lines yet.')).toBeTruthy()
  })

  test('a released Line has no way to change it', async () => {
    visit('owner', '/lines', lines, teams, members)
    const item = (await screen.findByText('+14155550004')).closest('li') as HTMLElement
    expect(within(item).getByText('Released')).toBeTruthy()
    expect(within(item).queryByRole('button')).toBeNull()
  })

  test('a 503 is explained in words, with a retry', async () => {
    let fail = true
    const portal = visit(
      'admin',
      '/lines',
      route('GET', LINES, () =>
        fail ? failure(503, ERRORS['server.unavailable'].code) : json(200, page([lineBody(1)]))
      ),
      teams,
      members
    )
    expect((await screen.findByRole('alert')).textContent).toContain(
      'The phone number service is not available right now'
    )
    fail = false
    await portal.user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('+14155550001')
  })

  test('a number and a label with markup are shown as isolated text', async () => {
    visit(
      'admin',
      '/lines',
      route('GET', LINES, json(200, page([lineBody(1, { label: '<script>x</script>' })]))),
      teams,
      members
    )
    const label = await screen.findByText('<script>x</script>')
    expect(document.querySelector('main script')).toBeNull()
    expect(label.tagName).toBe('BDI')
  })
})

describe('Lines: add', () => {
  test('buys a number with one idempotency key, announces it and refetches', async () => {
    const portal = visit(
      'admin',
      '/lines',
      route('POST', LINES, json(201, lineBody(9))),
      lines,
      teams,
      members
    )
    await portal.user.type(await screen.findByLabelText('Country'), 'US')
    await portal.user.type(screen.getByLabelText('Area code (optional)'), '415')
    await portal.user.type(screen.getByLabelText('Label (optional)'), '  Sales  ')
    await portal.user.click(screen.getByRole('button', { name: 'Add Line' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Line added.'))
    const posts = portal.calls.filter((call) => call.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(posts[0]?.body).toEqual({
      method: 'buy',
      country: 'US',
      areaCode: '415',
      label: 'Sales',
    })
    expect(posts[0]?.headers.get('idempotency-key')).toMatch(/^[A-Za-z0-9_.:-]{16,128}$/)
    expect(
      portal.calls.filter((call) => call.method === 'GET' && call.path === LINES).length
    ).toBeGreaterThan(1)
  })

  test('ports a number you already own', async () => {
    const portal = visit(
      'owner',
      '/lines',
      route('POST', LINES, json(201, lineBody(9, { state: 'porting' }))),
      lines,
      teams,
      members
    )
    await choose(portal.user, await screen.findByLabelText('How'), 'port')
    await portal.user.type(screen.getByLabelText('Number'), '+14155550100')
    await portal.user.click(screen.getByRole('button', { name: 'Add Line' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Line added.'))
    expect(portal.calls.find((call) => call.method === 'POST')?.body).toEqual({
      method: 'port',
      number: '+14155550100',
    })
  })

  test('a country that is not two capital letters is refused before anything is sent', async () => {
    const portal = visit('admin', '/lines', lines, teams, members)
    const country = await screen.findByLabelText('Country')
    await portal.user.type(country, 'usa')
    await portal.user.click(screen.getByRole('button', { name: 'Add Line' }))
    expect(country.getAttribute('aria-invalid')).toBe('true')
    await waitFor(() => expect(document.activeElement === country).toBe(true))
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
  })

  test('a number nobody can sell is explained in words', async () => {
    const portal = visit(
      'admin',
      '/lines',
      route('POST', LINES, () => failure(409, VOICE_ERRORS['line.number_unavailable'].code)),
      lines,
      teams,
      members
    )
    await portal.user.type(await screen.findByLabelText('Country'), 'US')
    await portal.user.click(screen.getByRole('button', { name: 'Add Line' }))
    expect((await screen.findByRole('alert')).textContent).toContain('That number is not available')
  })

  test('a 503 from the number provider is explained in words and a retry keeps the key', async () => {
    const portal = visit(
      'admin',
      '/lines',
      route('POST', LINES, () => failure(503, ERRORS['server.unavailable'].code)),
      lines,
      teams,
      members
    )
    await portal.user.type(await screen.findByLabelText('Country'), 'US')
    await portal.user.click(screen.getByRole('button', { name: 'Add Line' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'The phone number service is not available right now'
    )
    await portal.user.click(screen.getByRole('button', { name: 'Add Line' }))
    await waitFor(() =>
      expect(portal.calls.filter((call) => call.method === 'POST')).toHaveLength(2)
    )
    const [first, second] = portal.calls.filter((call) => call.method === 'POST')
    expect(second?.headers.get('idempotency-key')).toBe(first?.headers.get('idempotency-key') ?? '')
  })
})

describe('Lines: assign', () => {
  const assignment = (n: number) => `${LINES}/${hexId('line', n)}/assignment`

  test('assigns a Line to a Team', async () => {
    const portal = visit(
      'admin',
      '/lines',
      route('PUT', assignment(1), (call) =>
        json(200, lineBody(1, { assignment: call.body as { kind: 'team'; teamId: string } }))
      ),
      lines,
      teams,
      members
    )
    await screen.findByText('+14155550001')
    await portal.user.click(screen.getByRole('button', { name: 'Assign +14155550001' }))
    const select = await screen.findByLabelText('Who answers')
    await choose(portal.user, select, `team:${hexId('team', 2)}`)
    await portal.user.click(screen.getByRole('button', { name: 'Save assignment' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Line assigned.'))
    expect(portal.calls.find((call) => call.method === 'PUT')?.body).toEqual({
      kind: 'team',
      teamId: hexId('team', 2),
    })
  })

  test('assigns a Line to a Rep, offering only Reps', async () => {
    const portal = visit(
      'admin',
      '/lines',
      route('PUT', assignment(1), json(200, lineBody(1))),
      lines,
      teams,
      members
    )
    await screen.findByText('+14155550001')
    await portal.user.click(screen.getByRole('button', { name: 'Assign +14155550001' }))
    const select = await screen.findByLabelText('Who answers')
    let texts: string[] = []
    await waitFor(async () => {
      texts = (await optionsOf(portal.user, select, true)).map((option) => option.text)
      expect(texts.some((text) => /Maya Chen/.test(text))).toBe(true)
    })
    expect(texts.some((text) => /Omar Admin/.test(text))).toBe(false)
    await choose(portal.user, select, `rep:${hexId('mem', 1)}`)
    await portal.user.click(screen.getByRole('button', { name: 'Save assignment' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Line assigned.'))
    expect(portal.calls.find((call) => call.method === 'PUT')?.body).toEqual({
      kind: 'rep',
      membershipId: hexId('mem', 1),
    })
  })

  test('offers a Team and a Rep that sit on a later page, and names them', async () => {
    const portal = visit(
      'admin',
      '/lines',
      route('PUT', assignment(1), json(200, lineBody(1))),
      route('GET', LINES, json(200, page([lineBody(1)]))),
      route('GET', TEAMS, (call) =>
        param(call.url, 'cursor') === 't2'
          ? json(200, page([teamBody(2, 'Far Team')]))
          : json(200, page([teamBody(1, 'Near Team')], 't2'))
      ),
      route('GET', MEMBERS, (call) =>
        param(call.url, 'cursor') === 'm2'
          ? json(200, page([memberBody(2, { name: 'Far Rep', role: 'rep' })]))
          : json(200, page([memberBody(1, { name: 'Near Admin', role: 'admin' })], 'm2'))
      )
    )
    await screen.findByText('+14155550001')
    await portal.user.click(screen.getByRole('button', { name: 'Assign +14155550001' }))
    const select = await screen.findByLabelText('Who answers')
    await waitFor(async () => {
      const texts = (await optionsOf(portal.user, select)).map((option) => option.text)
      expect(texts.some((text) => /Far Team/.test(text))).toBe(true)
      expect(texts.some((text) => /Far Rep/.test(text))).toBe(true)
    })
  })

  test('assigns a Line to nobody', async () => {
    const portal = visit(
      'admin',
      '/lines',
      route('PUT', assignment(2), json(200, lineBody(2))),
      lines,
      teams,
      members
    )
    await screen.findByText('+14155550002')
    await portal.user.click(screen.getByRole('button', { name: 'Assign +14155550002' }))
    await choose(portal.user, await screen.findByLabelText('Who answers'), 'Nobody')
    await portal.user.click(screen.getByRole('button', { name: 'Save assignment' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Line assigned.'))
    expect(portal.calls.find((call) => call.method === 'PUT')?.body).toEqual({ kind: 'unassigned' })
  })

  test('a Team or Rep that is not in the Organization is explained in words', async () => {
    const portal = visit(
      'admin',
      '/lines',
      route('PUT', assignment(1), () => failure(422, VOICE_ERRORS['line.assignment_invalid'].code)),
      lines,
      teams,
      members
    )
    await screen.findByText('+14155550001')
    await portal.user.click(screen.getByRole('button', { name: 'Assign +14155550001' }))
    const select = await screen.findByLabelText('Who answers')
    await choose(portal.user, select, `team:${hexId('team', 1)}`)
    await portal.user.click(screen.getByRole('button', { name: 'Save assignment' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'That Team or Rep is not in your Organization'
    )
  })
})

describe('Lines: release', () => {
  const release = (n: number) => `${LINES}/${hexId('line', n)}/release`

  test('releases after a confirmation, and refetches', async () => {
    const portal = visit(
      'admin',
      '/lines',
      route('POST', release(1), json(200, lineBody(1, { state: 'released' }))),
      lines,
      teams,
      members
    )
    await screen.findByText('+14155550001')
    await portal.user.click(screen.getByRole('button', { name: 'Release +14155550001' }))
    expect(portal.calls.some((call) => call.path === release(1))).toBe(false)
    await portal.user.click(screen.getByRole('button', { name: 'Release Line' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Line released.'))
    expect(portal.calls.filter((call) => call.path === release(1))).toHaveLength(1)
    expect(
      portal.calls.filter((call) => call.method === 'GET' && call.path === LINES).length
    ).toBeGreaterThan(1)
  })

  test('a Line that is already gone is explained beside the control', async () => {
    const portal = visit(
      'admin',
      '/lines',
      route('POST', release(1), () => failure(404, VOICE_ERRORS['line.not_found'].code)),
      lines,
      teams,
      members
    )
    await screen.findByText('+14155550001')
    await portal.user.click(screen.getByRole('button', { name: 'Release +14155550001' }))
    await portal.user.click(screen.getByRole('button', { name: 'Release Line' }))
    expect((await screen.findByRole('alert')).textContent).toContain('That Line no longer exists')
  })
})
