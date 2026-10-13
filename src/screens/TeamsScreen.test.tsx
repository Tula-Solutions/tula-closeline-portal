import { describe, expect, test } from 'bun:test'
import { screen, waitFor, within } from '@testing-library/react'
import { CORE_ERRORS, ERRORS } from 'tula-closeline-contract'
import { hexId, memberBody, page, teamBody } from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal, waitUntilGone } from '~/testing/render'

const TEAMS = '/v1/teams'
const MEMBERS = '/v1/members'

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', ...handlers: Handler[]) {
  return renderPortal({
    url: '/teams',
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
      memberBody(1, { name: 'Maya Chen' }),
      memberBody(2, { name: null, email: 'bob@northline.app' }),
    ])
  )
)
const noContent = () => new Response(null, { status: 204 })

describe('Teams: the list', () => {
  test('lists Teams, a page at a time', async () => {
    const portal = visit(
      'rep',
      route('GET', TEAMS, (call) =>
        new URL(call.url, 'http://x').searchParams.get('cursor') === 'c2'
          ? json(200, page([teamBody(3, 'Third')]))
          : json(200, page([teamBody(1, 'Northern')], 'c2'))
      )
    )
    const list = await screen.findByRole('list', { name: 'Teams' })
    expect(within(list).getByText('Northern')).toBeTruthy()
    await portal.user.click(screen.getByRole('button', { name: 'Load more Teams' }))
    await screen.findByText('Third')
    expect(portal.calls.filter((call) => call.path === TEAMS)[0]?.url).toBe('/v1/teams?limit=25')
    expect(portal.calls.filter((call) => call.path === TEAMS)[1]?.url).toContain('cursor=c2')
  })

  test('says when there are none, and explains an error with a retry', async () => {
    visit('owner', route('GET', TEAMS, json(200, page([]))))
    expect(await screen.findByText('There are no Teams yet.')).toBeTruthy()
  })

  test('an error is explained and can be retried', async () => {
    let fail = true
    const portal = visit(
      'admin',
      route('GET', TEAMS, () =>
        fail ? failure(500, ERRORS['server.internal'].code) : json(200, page([teamBody(1)]))
      )
    )
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Something went wrong on our side'
    )
    fail = false
    await portal.user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('Team 1')
  })

  test.each(['manager', 'rep'] as const)(
    'a %s can read Teams but has no way to change them',
    async (role) => {
      visit(role, teams)
      await screen.findByText('Northern')
      expect(screen.queryByLabelText('Team name')).toBeNull()
      expect(screen.queryByRole('button', { name: /Rename|Delete|Members of/ })).toBeNull()
    }
  )

  test('a name with markup, a right-to-left override and 200 characters is shown as isolated, cut text', async () => {
    const override = `Evil${String.fromCharCode(0x202e)}gpj`
    const long = 'T'.repeat(200)
    visit(
      'rep',
      route(
        'GET',
        TEAMS,
        json(
          200,
          page([teamBody(1, '<script>x</script>'), teamBody(2, override), teamBody(3, long)])
        )
      )
    )
    await screen.findByText('<script>x</script>')
    expect(document.querySelector('main script')).toBeNull()
    for (const text of ['<script>x</script>', override, long]) {
      const element = screen.getByText(text)
      expect(element.tagName).toBe('BDI')
      expect(element.className).toBe('clip')
    }
  })
})

describe('Teams: create', () => {
  test('creates with one idempotency key, announces it, clears the field and refetches', async () => {
    const portal = visit('owner', route('POST', TEAMS, json(201, teamBody(9, 'New team'))), teams)
    await portal.user.type(await screen.findByLabelText('Team name'), '  New team  ')
    await portal.user.click(screen.getByRole('button', { name: 'Create Team' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Team created.'))
    const posts = portal.calls.filter((call) => call.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(posts[0]?.body).toEqual({ name: 'New team' })
    expect(posts[0]?.headers.get('idempotency-key')).toMatch(/^[A-Za-z0-9_.:-]{16,128}$/)
    expect((screen.getByLabelText('Team name') as HTMLInputElement).value).toBe('')
    expect(
      portal.calls.filter((call) => call.method === 'GET' && call.path === TEAMS).length
    ).toBeGreaterThan(1)
  })

  test.each([
    ['', 'empty'],
    ['   ', 'blank'],
    ['x'.repeat(201), 'too long'],
    [`bad${String.fromCharCode(7)}name`, 'a control character'],
  ])('a name that is %j (%s) is refused before anything is sent', async (name) => {
    const portal = visit('owner', teams)
    const field = await screen.findByLabelText('Team name')
    if (name !== '') {
      await portal.user.click(field)
      await portal.user.paste(name)
    }
    await portal.user.click(screen.getByRole('button', { name: 'Create Team' }))
    expect(field.getAttribute('aria-invalid')).toBe('true')
    await waitFor(() => expect(document.activeElement === field).toBe(true))
    expect(
      document.getElementById(field.getAttribute('aria-describedby') ?? '')?.textContent
    ).toContain('1 to 200 characters')
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
  })

  test('a double submit sends one request', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const portal = visit(
      'owner',
      route('POST', TEAMS, async () => {
        await gate
        return json(201, teamBody(9, 'Once'))
      }),
      teams
    )
    await portal.user.type(await screen.findByLabelText('Team name'), 'Once')
    const button = screen.getByRole('button', { name: 'Create Team' })
    await portal.user.dblClick(button)
    await portal.user.keyboard('{Enter}')
    release()
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Team created.'))
    expect(portal.calls.filter((call) => call.method === 'POST')).toHaveLength(1)
  })

  test('a retry after a network failure reuses the key', async () => {
    let attempts = 0
    const portal = visit(
      'owner',
      route('POST', TEAMS, () => {
        attempts += 1
        if (attempts === 1) {
          throw new TypeError('network down')
        }
        return json(201, teamBody(9, 'Retry'))
      }),
      teams
    )
    await portal.user.type(await screen.findByLabelText('Team name'), 'Retry')
    await portal.user.click(screen.getByRole('button', { name: 'Create Team' }))
    await screen.findByText(/Could not reach Closeline/)
    await portal.user.click(screen.getByRole('button', { name: 'Create Team' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Team created.'))
    const keys = portal.calls
      .filter((call) => call.method === 'POST')
      .map((call) => call.headers.get('idempotency-key'))
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  test('a taken name is explained beside the field', async () => {
    const portal = visit(
      'owner',
      route('POST', TEAMS, failure(409, CORE_ERRORS['team.name_taken'].code)),
      teams
    )
    await portal.user.type(await screen.findByLabelText('Team name'), 'Northern')
    await portal.user.click(screen.getByRole('button', { name: 'Create Team' }))
    await waitFor(() => {
      const field = screen.getByLabelText('Team name')
      expect(
        document.getElementById(field.getAttribute('aria-describedby') ?? '')?.textContent
      ).toContain('A Team with that name already exists.')
      expect(document.activeElement === field).toBe(true)
    })
    expect(portal.reports).toEqual([])
  })

  test('a 403 is explained', async () => {
    const portal = visit(
      'admin',
      route('POST', TEAMS, failure(403, ERRORS['auth.forbidden'].code)),
      teams
    )
    await portal.user.type(await screen.findByLabelText('Team name'), 'Nope')
    await portal.user.click(screen.getByRole('button', { name: 'Create Team' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Your role does not allow this'
    )
  })
})

describe('Teams: rename and delete', () => {
  test('renames: the field is focused with the old name, one PATCH, focus returns to Rename', async () => {
    const portal = visit(
      'admin',
      route('PATCH', `${TEAMS}/${hexId('team', 1)}`, json(200, teamBody(1, 'Renamed'))),
      teams
    )
    await screen.findByText('Northern')
    await portal.user.click(screen.getByRole('button', { name: 'Rename Northern' }))
    const field = screen.getByLabelText('New Team name') as HTMLInputElement
    expect(document.activeElement === field).toBe(true)
    expect(field.value).toBe('Northern')
    await portal.user.clear(field)
    await portal.user.type(field, 'Renamed{Enter}')
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Team renamed.'))
    expect(portal.calls.filter((call) => call.method === 'PATCH')).toHaveLength(1)
    expect(portal.calls.find((call) => call.method === 'PATCH')?.body).toEqual({ name: 'Renamed' })
    await waitFor(() =>
      expect(
        document.activeElement === screen.getByRole('button', { name: 'Rename Northern' })
      ).toBe(true)
    )
  })

  test('Escape cancels a rename without sending', async () => {
    const portal = visit('owner', teams)
    await screen.findByText('Northern')
    await portal.user.click(screen.getByRole('button', { name: 'Rename Northern' }))
    await portal.user.keyboard('{Escape}')
    expect(screen.queryByLabelText('New Team name')).toBeNull()
    expect(portal.calls.some((call) => call.method === 'PATCH')).toBe(false)
  })

  test('a name already taken is explained beside the field and the form stays open', async () => {
    const portal = visit(
      'owner',
      route(
        'PATCH',
        `${TEAMS}/${hexId('team', 1)}`,
        failure(409, CORE_ERRORS['team.name_taken'].code)
      ),
      teams
    )
    await screen.findByText('Northern')
    await portal.user.click(screen.getByRole('button', { name: 'Rename Northern' }))
    const field = screen.getByLabelText('New Team name')
    await portal.user.clear(field)
    await portal.user.type(field, 'Southern{Enter}')
    await screen.findByText(/A Team with that name already exists/)
    expect(screen.getByLabelText('New Team name')).toBeTruthy()
  })

  test('an empty new name is refused before anything is sent', async () => {
    const portal = visit('owner', teams)
    await screen.findByText('Northern')
    await portal.user.click(screen.getByRole('button', { name: 'Rename Northern' }))
    await portal.user.clear(screen.getByLabelText('New Team name'))
    await portal.user.keyboard('{Enter}')
    expect(screen.getByLabelText('New Team name').getAttribute('aria-invalid')).toBe('true')
    expect(portal.calls.some((call) => call.method === 'PATCH')).toBe(false)
  })

  test('delete asks first, then sends one request and refetches', async () => {
    let deleted = false
    const portal = visit(
      'owner',
      route('DELETE', `${TEAMS}/${hexId('team', 2)}`, () => {
        deleted = true
        return noContent()
      }),
      route('GET', TEAMS, () =>
        json(
          200,
          page(
            deleted ? [teamBody(1, 'Northern')] : [teamBody(1, 'Northern'), teamBody(2, 'Southern')]
          )
        )
      )
    )
    await screen.findByText('Southern')
    await portal.user.click(screen.getByRole('button', { name: 'Delete Southern' }))
    expect(portal.calls.some((call) => call.method === 'DELETE')).toBe(false)
    await portal.user.click(screen.getByRole('button', { name: 'Delete Team' }))
    await waitUntilGone('Southern')
    expect(screen.getByRole('status').textContent).toBe('Team deleted.')
    expect(portal.calls.filter((call) => call.method === 'DELETE')).toHaveLength(1)
    expect(document.activeElement === screen.getByRole('heading', { name: 'Teams' })).toBe(true)
  })

  test('a Team that is already gone is explained beside the control', async () => {
    const portal = visit(
      'owner',
      route(
        'DELETE',
        `${TEAMS}/${hexId('team', 1)}`,
        failure(404, CORE_ERRORS['team.not_found'].code)
      ),
      teams
    )
    await screen.findByText('Northern')
    await portal.user.click(screen.getByRole('button', { name: 'Delete Northern' }))
    await portal.user.click(screen.getByRole('button', { name: 'Delete Team' }))
    expect((await screen.findByRole('alert')).textContent).toContain('That Team no longer exists')
  })
})

describe('Teams: adding and removing members', () => {
  const open = async (portal: ReturnType<typeof visit>) => {
    await screen.findByText('Northern')
    await portal.user.click(screen.getByRole('button', { name: 'Members of Northern' }))
    return screen.findByLabelText('Member')
  }
  const path = `${TEAMS}/${hexId('team', 1)}/members`

  test('says the Team list is not served and offers the Organization members, name or email, a page at a time', async () => {
    const portal = visit('owner', teams, members)
    const select = await open(portal)
    expect(screen.getByText(/who is in a Team is not available yet/)).toBeTruthy()
    const options = [...select.querySelectorAll('option')].map((option) => option.textContent ?? '')
    expect(options).toHaveLength(2)
    expect(options[0]).toContain('Maya Chen')
    expect(options[1]).toContain('bob@northline.app')
    expect(
      screen.getByRole('button', { name: 'Members of Northern' }).getAttribute('aria-expanded')
    ).toBe('true')
  })

  test('adds the chosen member with one key; a double click sends one request', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const portal = visit(
      'admin',
      route('POST', path, async () => {
        await gate
        return json(200, {
          teamId: hexId('team', 1),
          membershipId: hexId('mem', 2),
          createdAt: '2026-10-13T00:00:00Z',
        })
      }),
      teams,
      members
    )
    const select = await open(portal)
    await portal.user.selectOptions(select, hexId('mem', 2))
    const add = screen.getByRole('button', { name: 'Add to Team' })
    await portal.user.dblClick(add)
    release()
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Member added to the Team.')
    )
    const posts = portal.calls.filter((call) => call.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(posts[0]?.body).toEqual({ membershipId: hexId('mem', 2) })
    expect(posts[0]?.headers.get('idempotency-key')).toMatch(/^[A-Za-z0-9_.:-]{16,128}$/)
  })

  test('a retry after a network failure reuses the key', async () => {
    let attempts = 0
    const portal = visit(
      'owner',
      route('POST', path, () => {
        attempts += 1
        if (attempts === 1) {
          throw new TypeError('network down')
        }
        return json(200, {
          teamId: hexId('team', 1),
          membershipId: hexId('mem', 1),
          createdAt: '2026-10-13T00:00:00Z',
        })
      }),
      teams,
      members
    )
    await open(portal)
    await portal.user.click(screen.getByRole('button', { name: 'Add to Team' }))
    await screen.findByText(/Could not reach Closeline/)
    await portal.user.click(screen.getByRole('button', { name: 'Add to Team' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Member added to the Team.')
    )
    const keys = portal.calls
      .filter((call) => call.method === 'POST')
      .map((call) => call.headers.get('idempotency-key'))
    expect(keys[0]).toBe(keys[1])
  })

  test('removes the chosen member with one DELETE', async () => {
    const portal = visit(
      'owner',
      route('DELETE', `${path}/${hexId('mem', 1)}`, noContent),
      teams,
      members
    )
    await open(portal)
    await portal.user.click(screen.getByRole('button', { name: 'Remove from Team' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Member removed from the Team.')
    )
    expect(portal.calls.filter((call) => call.method === 'DELETE')).toHaveLength(1)
  })

  test.each([
    [
      'a missing member',
      404,
      CORE_ERRORS['member.not_found'].code,
      'no longer in your Organization',
    ],
    ['a 403', 403, ERRORS['auth.forbidden'].code, 'Your role does not allow this'],
    [
      'the first try still running',
      409,
      ERRORS['request.idempotency_in_progress'].code,
      'still running',
    ],
  ])('%s when adding is explained beside the control', async (_name, status, code, words) => {
    const portal = visit('owner', route('POST', path, failure(status, code)), teams, members)
    const select = await open(portal)
    await portal.user.click(screen.getByRole('button', { name: 'Add to Team' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(words)
    expect(select.getAttribute('aria-describedby')).toBe(alert.id)
  })

  test('member names with a right-to-left override are wrapped in direction isolates in the choice', async () => {
    const name = `Evil${String.fromCharCode(0x202e)}gpj`
    const portal = visit(
      'owner',
      teams,
      route('GET', MEMBERS, json(200, page([memberBody(1, { name })])))
    )
    const select = await open(portal)
    const text = select.querySelector('option')?.textContent ?? ''
    expect(text.startsWith('⁨')).toBe(true)
    expect(text).toContain(`⁨${name}⁩`)
  })
})
