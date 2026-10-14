import { describe, expect, test } from 'bun:test'
import { act, screen, waitFor } from '@testing-library/react'
import { CORE_ERRORS, ERRORS } from 'tula-closeline-contract'
import { hexId, invitationBody, memberBody, page, teamBody } from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal, waitUntilGone } from '~/testing/render'

const REFRESH = '/v1/client/sessions/refresh'
const MEMBERS = '/v1/members'
const TEAMS = '/v1/teams'
const INVITATIONS = '/v1/invitations'

function visit(url: string, role: 'owner' | 'admin' = 'owner', ...handlers: Handler[]) {
  return renderPortal({
    url,
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers,
  })
}

const networkDown = () => {
  throw new TypeError('network down')
}
const noContent = () => new Response(null, { status: 204 })
const postKeys = (portal: ReturnType<typeof visit>, path: string) =>
  portal.calls
    .filter((call) => call.method === 'POST' && call.path === path)
    .map((call) => call.headers.get('idempotency-key'))

describe('F1: another Organization never sees the previous one', () => {
  test('adopting Organization B through a refresh drops A, fetches again, and keys every query by Organization', async () => {
    let who = 'A'
    const portal = visit(
      '/members',
      'owner',
      route('GET', MEMBERS, () =>
        json(200, page([memberBody(who === 'A' ? 1 : 2, { name: `${who} person` })]))
      ),
      route('POST', REFRESH, () =>
        json(200, tokens({ accessToken: 'access-2', organization: { id: 'org_2', role: 'owner' } }))
      )
    )
    await screen.findByText('A person')
    const before = portal.calls.filter((call) => call.path === MEMBERS).length
    who = 'B'
    await act(() => portal.app.session.refresh('access-1'))
    await screen.findByText('B person')
    expect(screen.queryByText('A person')).toBeNull()
    expect(portal.calls.filter((call) => call.path === MEMBERS).length).toBeGreaterThan(before)
    // The person stays on the screen they were on.
    expect(screen.getByRole('heading', { name: 'Members' })).toBeTruthy()
    const keys = portal.app.queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey)
    expect(keys.length).toBeGreaterThan(0)
    expect(keys.filter((key) => key.includes('org_1'))).toEqual([])
    expect(keys.filter((key) => key.includes('org_2')).length).toBeGreaterThan(0)
  })

  test('a held idempotency key is dropped when the Organization changes', async () => {
    const portal = visit(
      '/invitations',
      'owner',
      route('GET', INVITATIONS, json(200, page([]))),
      route('POST', INVITATIONS, networkDown),
      route(
        'POST',
        REFRESH,
        json(200, tokens({ accessToken: 'access-2', organization: { id: 'org_2', role: 'owner' } }))
      )
    )
    await portal.user.type(await screen.findByLabelText('Email address'), 'a@northline.app')
    await portal.user.click(screen.getByRole('button', { name: 'Send Invitation' }))
    await screen.findByRole('alert')
    await act(() => portal.app.session.refresh('access-1'))
    await waitFor(() =>
      expect(portal.app.session.getSnapshot()).toMatchObject({ organization: { id: 'org_2' } })
    )
    await portal.user.type(await screen.findByLabelText('Email address'), 'a@northline.app')
    await portal.user.click(screen.getByRole('button', { name: 'Send Invitation' }))
    await waitFor(() => expect(postKeys(portal, INVITATIONS)).toHaveLength(2))
    const [first, second] = postKeys(portal, INVITATIONS)
    expect(first).not.toBe(second)
  })
})

describe('F2: a key identifies one intent', () => {
  const teams = route('GET', TEAMS, json(200, page([teamBody(1, 'Northern')])))
  const members = route('GET', MEMBERS, json(200, page([memberBody(1, { name: 'Maya Chen' })])))
  const path = `${TEAMS}/${hexId('team', 1)}/members`

  test('add fails with a network error, remove succeeds, add again: the second add has a new key', async () => {
    let adds = 0
    const portal = visit(
      '/teams',
      'owner',
      route('POST', path, () => {
        adds += 1
        if (adds === 1) {
          throw new TypeError('network down')
        }
        return json(200, {
          teamId: hexId('team', 1),
          membershipId: hexId('mem', 1),
          createdAt: '2026-10-13T00:00:00Z',
        })
      }),
      route('DELETE', `${path}/${hexId('mem', 1)}`, noContent),
      teams,
      members
    )
    await screen.findByText('Northern')
    await portal.user.click(screen.getByRole('button', { name: 'Members of Northern' }))
    await screen.findByLabelText('Member')
    await portal.user.click(screen.getByRole('button', { name: 'Add to Team' }))
    await screen.findByText(/Could not reach Closeline/)
    await portal.user.click(screen.getByRole('button', { name: 'Remove from Team' }))
    await waitFor(() =>
      expect(
        screen.getByText('Member removed from the Team.').closest('[role=status]')
      ).not.toBeNull()
    )
    await portal.user.click(screen.getByRole('button', { name: 'Add to Team' }))
    await waitFor(() => expect(postKeys(portal, path)).toHaveLength(2))
    const [first, second] = postKeys(portal, path)
    expect(first).not.toBe(second)
  })

  test('create a Team fails, delete a Team, create the same name again: a new key', async () => {
    let creates = 0
    const portal = visit(
      '/teams',
      'owner',
      route('POST', TEAMS, () => {
        creates += 1
        if (creates === 1) {
          throw new TypeError('network down')
        }
        return json(201, teamBody(9, 'Northern'))
      }),
      route('DELETE', `${TEAMS}/${hexId('team', 1)}`, noContent),
      teams
    )
    await screen.findByText('Northern', { selector: 'bdi' })
    await portal.user.type(screen.getByLabelText('Team name'), 'Northern')
    await portal.user.click(screen.getByRole('button', { name: 'Create Team' }))
    await screen.findByText(/Could not reach Closeline/)
    await portal.user.click(screen.getByRole('button', { name: 'Delete Northern' }))
    await portal.user.click(screen.getByRole('button', { name: 'Delete Team' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Team deleted.'))
    await portal.user.click(screen.getByRole('button', { name: 'Create Team' }))
    await waitFor(() => expect(postKeys(portal, TEAMS)).toHaveLength(2))
    const [first, second] = postKeys(portal, TEAMS)
    expect(first).not.toBe(second)
  })

  test('invite fails, revoke the same address, invite again: a new key', async () => {
    let sends = 0
    const portal = visit(
      '/invitations',
      'owner',
      route('POST', INVITATIONS, () => {
        sends += 1
        if (sends === 1) {
          throw new TypeError('network down')
        }
        return json(201, invitationBody(5, { email: 'a@northline.app' }))
      }),
      route('DELETE', `${INVITATIONS}/${hexId('inv', 5)}`, noContent),
      route('GET', INVITATIONS, json(200, page([invitationBody(5, { email: 'a@northline.app' })])))
    )
    await portal.user.type(await screen.findByLabelText('Email address'), 'a@northline.app')
    await portal.user.click(screen.getByRole('button', { name: 'Send Invitation' }))
    await screen.findByText(/Could not reach Closeline/)
    await portal.user.click(screen.getByRole('button', { name: /Revoke the Invitation for/ }))
    await portal.user.click(screen.getByRole('button', { name: 'Revoke Invitation' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Invitation revoked.'))
    await portal.user.click(screen.getByRole('button', { name: 'Send Invitation' }))
    await waitFor(() => expect(postKeys(portal, INVITATIONS)).toHaveLength(2))
    const [first, second] = postKeys(portal, INVITATIONS)
    expect(first).not.toBe(second)
  })
})

describe('F3: the key survives leaving the screen', () => {
  test('time out an invite, leave and come back, send the same one: the same key', async () => {
    const portal = visit(
      '/invitations',
      'owner',
      route('POST', INVITATIONS, networkDown),
      route('GET', INVITATIONS, json(200, page([]))),
      route('GET', MEMBERS, json(200, page([])))
    )
    await portal.user.type(await screen.findByLabelText('Email address'), 'a@northline.app')
    await portal.user.click(screen.getByRole('button', { name: 'Send Invitation' }))
    await screen.findByRole('alert')
    await act(() => portal.router.navigate({ to: '/members' }))
    await screen.findByRole('heading', { name: 'Members' })
    await act(() => portal.router.navigate({ to: '/invitations' }))
    await portal.user.type(await screen.findByLabelText('Email address'), 'a@northline.app')
    await portal.user.click(screen.getByRole('button', { name: 'Send Invitation' }))
    await waitFor(() => expect(postKeys(portal, INVITATIONS)).toHaveLength(2))
    const [first, second] = postKeys(portal, INVITATIONS)
    expect(first).toBe(second)
  })

  test('time out a Team creation, leave and come back: the same key', async () => {
    const portal = visit(
      '/teams',
      'owner',
      route('POST', TEAMS, networkDown),
      route('GET', TEAMS, json(200, page([]))),
      route('GET', MEMBERS, json(200, page([])))
    )
    await portal.user.type(await screen.findByLabelText('Team name'), 'Fresh')
    await portal.user.click(screen.getByRole('button', { name: 'Create Team' }))
    await screen.findByText(/Could not reach Closeline/)
    await act(() => portal.router.navigate({ to: '/members' }))
    await screen.findByRole('heading', { name: 'Members' })
    await act(() => portal.router.navigate({ to: '/teams' }))
    await portal.user.type(await screen.findByLabelText('Team name'), 'Fresh')
    await portal.user.click(screen.getByRole('button', { name: 'Create Team' }))
    await waitFor(() => expect(postKeys(portal, TEAMS)).toHaveLength(2))
    const [first, second] = postKeys(portal, TEAMS)
    expect(first).toBe(second)
  })
})

describe('F4: what is chosen follows the data', () => {
  test('a role changed elsewhere shows in the row after a refetch', async () => {
    let role = 'rep'
    const portal = visit(
      '/members',
      'owner',
      route('GET', MEMBERS, () => json(200, page([memberBody(2, { name: 'Rita Rep', role })])))
    )
    await screen.findByText('Rita Rep')
    expect((screen.getByLabelText('Role for Rita Rep') as HTMLSelectElement).value).toBe('rep')
    role = 'manager'
    await act(() => portal.app.queryClient.invalidateQueries())
    await waitFor(() =>
      expect((screen.getByLabelText('Role for Rita Rep') as HTMLSelectElement).value).toBe(
        'manager'
      )
    )
    expect(screen.queryByRole('button', { name: 'Save role for Rita Rep' })).toBeNull()
  })

  test('a chosen member who leaves the list is replaced by the first, and an empty list offers nothing', async () => {
    let list = [memberBody(1, { name: 'Maya Chen' }), memberBody(2, { name: 'Bob Bell' })]
    const path = `${TEAMS}/${hexId('team', 1)}/members`
    const portal = visit(
      '/teams',
      'owner',
      route('GET', TEAMS, json(200, page([teamBody(1, 'Northern')]))),
      route('GET', MEMBERS, () => json(200, page(list))),
      route(
        'POST',
        path,
        json(200, {
          teamId: hexId('team', 1),
          membershipId: hexId('mem', 1),
          createdAt: '2026-10-13T00:00:00Z',
        })
      )
    )
    await screen.findByText('Northern', { selector: 'bdi' })
    await portal.user.click(screen.getByRole('button', { name: 'Members of Northern' }))
    const select = (await screen.findByLabelText('Member')) as HTMLSelectElement
    await portal.user.selectOptions(select, hexId('mem', 2))
    list = [memberBody(1, { name: 'Maya Chen' })]
    await act(() => portal.app.queryClient.invalidateQueries())
    await waitFor(() =>
      expect((screen.getByLabelText('Member') as HTMLSelectElement).value).toBe(hexId('mem', 1))
    )
    await portal.user.click(screen.getByRole('button', { name: 'Add to Team' }))
    await waitFor(() =>
      expect(portal.calls.filter((call) => call.method === 'POST')).toHaveLength(1)
    )
    expect(portal.calls.find((call) => call.method === 'POST')?.body).toEqual({
      membershipId: hexId('mem', 1),
    })
    list = []
    await act(() => portal.app.queryClient.invalidateQueries())
    await screen.findByText('There are no members to choose from.')
    expect(screen.queryByRole('button', { name: 'Add to Team' })).toBeNull()
  })
})

describe('F5: wording and duplicates', () => {
  test('a 429 on an invite names both limits without claiming which', async () => {
    const portal = visit(
      '/invitations',
      'owner',
      route('POST', INVITATIONS, failure(429, ERRORS['rate.limited'].code, { retryAfter: 300 })),
      route('GET', INVITATIONS, json(200, page([])))
    )
    await portal.user.type(await screen.findByLabelText('Email address'), 'a@northline.app')
    await portal.user.click(screen.getByRole('button', { name: 'Send Invitation' }))
    const text = (await screen.findByRole('alert')).textContent ?? ''
    expect(text).toContain('pending')
    expect(text).toContain('Try again in 5 minutes.')
    expect(text).not.toContain('Too many tries.')
  })

  test('a second page that repeats an id shows that row once', async () => {
    const portal = visit(
      '/members',
      'owner',
      route('GET', MEMBERS, (call) =>
        new URL(call.url, 'http://x').searchParams.get('cursor') === 'c2'
          ? json(
              200,
              page([memberBody(1, { name: 'Maya Chen' }), memberBody(3, { name: 'Third' })])
            )
          : json(
              200,
              page([memberBody(1, { name: 'Maya Chen' }), memberBody(2, { name: 'Second' })], 'c2')
            )
      )
    )
    await screen.findByText('Second')
    await portal.user.click(screen.getByRole('button', { name: 'Load more members' }))
    await screen.findByText('Third')
    expect(screen.getAllByText('Maya Chen')).toHaveLength(1)
  })

  test('the CORE code for a taken name still reads as a name problem', () => {
    expect(CORE_ERRORS['team.name_taken'].code).toBe('team.name_taken')
  })
})

describe('F6: accessible names', () => {
  test('a trigger is named for what it is doing while pending', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let removed = false
    const portal = visit(
      '/members',
      'owner',
      route('DELETE', `${MEMBERS}/${hexId('mem', 2)}`, async () => {
        await gate
        removed = true
        return noContent()
      }),
      route('GET', MEMBERS, () =>
        json(
          200,
          page(removed ? [memberBody(1, { name: 'Olive' })] : [memberBody(2, { name: 'Rita Rep' })])
        )
      )
    )
    await screen.findByText('Rita Rep')
    await portal.user.click(screen.getByRole('button', { name: 'Remove Rita Rep' }))
    await portal.user.click(screen.getByRole('button', { name: 'Remove member' }))
    const pending = await screen.findByRole('button', { name: 'Removing Rita Rep' })
    expect(pending.textContent).toBe('Removing...')
    release()
    await waitUntilGone('Rita Rep')
  })

  test('bidirectional and control characters are stripped from the names in labels', async () => {
    const dirty = `Evil${String.fromCharCode(0x202e)}${String.fromCharCode(0x200b)}gpj${String.fromCharCode(7)}`
    visit('/teams', 'owner', route('GET', TEAMS, json(200, page([teamBody(1, dirty)]))))
    const rename = await screen.findByRole('button', { name: 'Rename Evilgpj' })
    for (const button of [
      rename,
      screen.getByRole('button', { name: 'Members of Evilgpj' }),
      screen.getByRole('button', { name: 'Delete Evilgpj' }),
    ]) {
      expect(button.getAttribute('aria-label')).toMatch(/^[\x20-\x7e]+$/)
    }
  })
})

describe('F11: labels fall back when nothing visible is left', () => {
  test('a member whose name is only zero-width characters is labelled by the email', async () => {
    visit(
      '/members',
      'owner',
      route(
        'GET',
        MEMBERS,
        json(
          200,
          page([memberBody(2, { name: String.fromCharCode(0x200b), email: 'zed@northline.app' })])
        )
      )
    )
    expect(await screen.findByRole('button', { name: 'Remove zed@northline.app' })).toBeTruthy()
    expect(screen.getByLabelText('Role for zed@northline.app')).toBeTruthy()
  })

  test('a Team whose name is only invisible characters is labelled with a plain noun', async () => {
    const name = `${String.fromCharCode(0x00ad)}${String.fromCharCode(0x3164)}${String.fromCharCode(0xfe0f)}`
    visit('/teams', 'owner', route('GET', TEAMS, json(200, page([teamBody(1, name)]))))
    expect(await screen.findByRole('button', { name: 'Rename unnamed Team' })).toBeTruthy()
  })
})

describe('F7: one member in two Teams, over the real screens', () => {
  test('add to X fails, add the same member to Y: a different key on a different path', async () => {
    const pathX = `${TEAMS}/${hexId('team', 1)}/members`
    const pathY = `${TEAMS}/${hexId('team', 2)}/members`
    const portal = visit(
      '/teams',
      'owner',
      route('POST', pathX, networkDown),
      route(
        'POST',
        pathY,
        json(200, {
          teamId: hexId('team', 2),
          membershipId: hexId('mem', 1),
          createdAt: '2026-10-13T00:00:00Z',
        })
      ),
      route('GET', TEAMS, json(200, page([teamBody(1, 'Northern'), teamBody(2, 'Southern')]))),
      route('GET', MEMBERS, json(200, page([memberBody(1, { name: 'Maya Chen' })])))
    )
    await screen.findByText('Southern', { selector: 'bdi' })
    await portal.user.click(screen.getByRole('button', { name: 'Members of Northern' }))
    await portal.user.click(await screen.findByRole('button', { name: 'Add to Team' }))
    await screen.findByText(/Could not reach Closeline/)
    await portal.user.click(screen.getByRole('button', { name: 'Members of Southern' }))
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Add to Team' })).toHaveLength(2)
    )
    await portal.user.click(
      screen.getAllByRole('button', { name: 'Add to Team' })[1] as HTMLElement
    )
    await waitFor(() => expect(postKeys(portal, pathY)).toHaveLength(1))
    expect(postKeys(portal, pathY)[0]).not.toBe(postKeys(portal, pathX)[0])
  })
})
