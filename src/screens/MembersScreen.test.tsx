import { describe, expect, test } from 'bun:test'
import { screen, waitFor, within } from '@testing-library/react'
import { CORE_ERRORS } from 'tula-closeline-contract'
import { hexId, memberBody, page } from '~/testing/core-bodies'
import { failure, json, route, tokens } from '~/testing/fixtures'
import { renderPortal, waitUntilGone } from '~/testing/render'
import { choose, optionsOf, shownBy } from '~/testing/select'

const MEMBERS = '/v1/members'

function visit(
  role: 'owner' | 'admin' | 'manager' | 'rep',
  ...handlers: ReturnType<typeof route>[]
) {
  return renderPortal({
    url: '/members',
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers,
  })
}

function roleIn(row: HTMLElement | undefined): string | undefined {
  const cell = within(row as HTMLElement).getAllByRole('cell')[1]
  const select = cell?.querySelector('button[data-slot="select-trigger"]')
  return select ? shownBy(select as HTMLElement) : cell?.textContent
}

describe('members: the list', () => {
  test('shows the name, the email address and the role, with the email address standing in for a missing name', async () => {
    const portal = visit(
      'owner',
      route(
        'GET',
        MEMBERS,
        json(
          200,
          page([
            memberBody(1, { name: 'Maya Chen', role: 'owner' }),
            memberBody(2, { name: null, email: 'noname@northline.app', role: 'manager' }),
          ])
        )
      )
    )
    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(within(rows[1] as HTMLElement).getByText('Maya Chen')).toBeTruthy()
    // A role the viewer may change is the chosen option of its inline select; otherwise it is text.
    expect(roleIn(rows[1])).toBe('Owner')
    // No name: the address is the row's heading and also its email cell.
    expect(within(rows[2] as HTMLElement).getAllByText('noname@northline.app')).toHaveLength(2)
    expect(roleIn(rows[2])).toBe('Manager')
    expect(portal.calls.find((call) => call.path === MEMBERS)?.url).toBe('/v1/members?limit=25')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent)
    ).toContain('Email address')
    // Review F2: an sr-only (absolutely positioned) cell can lose its table-cell semantics.
    expect(table.querySelectorAll('th.sr-only, td.sr-only')).toHaveLength(0)
    expect(within(rows[1] as HTMLElement).getAllByRole('cell')[0]?.textContent).toBe(
      'member1@northline.app'
    )
  })

  test('on a phone each row stacks, and a member with no name shows the address once', async () => {
    visit(
      'owner',
      route(
        'GET',
        MEMBERS,
        json(
          200,
          page([
            memberBody(1, { name: 'Maya Chen', role: 'owner' }),
            memberBody(2, { name: null, email: 'noname@northline.app', role: 'manager' }),
          ])
        )
      )
    )
    const table = await screen.findByRole('table')
    expect(table.classList.contains('ledger-stack')).toBe(true)
    const rows = within(table).getAllByRole('row')
    const emailCell = (row: HTMLElement | undefined) =>
      within(row as HTMLElement).getAllByRole('cell')[0] as HTMLElement
    expect(emailCell(rows[1]).classList.contains('max-sm:hidden')).toBe(false)
    expect(emailCell(rows[2]).classList.contains('max-sm:hidden')).toBe(true)
  })

  test('loads one page at a time and "Load more" asks for the next cursor', async () => {
    const portal = visit(
      'admin',
      route('GET', MEMBERS, (call) =>
        new URL(call.url, 'http://x').searchParams.get('cursor') === 'c2'
          ? json(200, page([memberBody(3)]))
          : json(200, page([memberBody(1), memberBody(2)], 'c2'))
      )
    )
    await screen.findByText('Member 2')
    expect(screen.queryByText('Member 3')).toBeNull()
    await portal.user.click(screen.getByRole('button', { name: 'Load more members' }))
    await screen.findByText('Member 3')
    expect(screen.queryByRole('button', { name: 'Load more members' })).toBeNull()
    expect(portal.calls.filter((call) => call.path === MEMBERS)).toHaveLength(2)
    expect(portal.calls.filter((call) => call.path === MEMBERS)[1]?.url).toContain('cursor=c2')
  })

  test('says it is loading, then says when there is nothing to show', async () => {
    visit('owner', route('GET', MEMBERS, json(200, page([]))))
    expect(await screen.findByText('There are no members to show.')).toBeTruthy()
  })

  test('an error is explained with a way to try again, and a 5xx is reported', async () => {
    let fail = true
    const portal = visit(
      'owner',
      route('GET', MEMBERS, () =>
        fail ? failure(500, 'server.internal') : json(200, page([memberBody(1)]))
      )
    )
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Something went wrong on our side. Try again.'
    )
    expect(portal.reports).toHaveLength(1)
    fail = false
    await portal.user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('Member 1')
  })

  test('a Rep is told their role cannot see members, and nothing is requested', async () => {
    const portal = visit('rep')
    expect(await screen.findByText(/Your role cannot see the list of members/)).toBeTruthy()
    expect(portal.calls.some((call) => call.path === MEMBERS)).toBe(false)
  })

  test('a 403 from core for a role the screen thought allowed is explained, not crashed on', async () => {
    visit('manager', route('GET', MEMBERS, failure(403, 'auth.forbidden')))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Your role does not allow this'
    )
  })
})

describe('members: untrusted text', () => {
  test('markup in a name is text, a right-to-left override is isolated, and a long name is cut in layout', async () => {
    const markup = '<img src=x onerror=alert(1)>'
    const override = `Evil${String.fromCharCode(0x202e)}gpj.exe`
    const long = 'N'.repeat(200)
    visit(
      'owner',
      route(
        'GET',
        MEMBERS,
        json(
          200,
          page([
            memberBody(1, { name: markup }),
            memberBody(2, { name: override }),
            memberBody(3, { name: long }),
            memberBody(4, { name: `a${String.fromCharCode(0x200b)}b` }),
          ])
        )
      )
    )
    await screen.findByText(markup)
    expect(document.querySelector('img[src="x"]')).toBeNull()
    for (const text of [markup, override, long, `a${String.fromCharCode(0x200b)}b`]) {
      const element = screen.getAllByText(text)[0] as HTMLElement
      expect(element.tagName).toBe('BDI')
      expect(element.className).toBe('clip')
      expect(element.textContent).toBe(text)
    }
    // The full value stays reachable (a tooltip) while the layout shows an ellipsis.
    expect(screen.getByText(long).getAttribute('title')).toBe(long)
  })
})

describe('members: changing a role and removing', () => {
  const list = route(
    'GET',
    MEMBERS,
    json(
      200,
      page([
        memberBody(1, { name: 'Olive Owner', role: 'owner' }),
        memberBody(2, { name: 'Rita Rep', role: 'rep' }),
        memberBody(3, { name: 'Adam Admin', role: 'admin' }),
      ])
    )
  )

  test('an Owner changes a role: pending, one request, the list refetched, the change announced', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const portal = visit(
      'owner',
      route('PATCH', `${MEMBERS}/${hexId('mem', 2)}`, async () => {
        await gate
        return json(200, memberBody(2, { name: 'Rita Rep', role: 'manager' }))
      }),
      list
    )
    await screen.findByText('Rita Rep')
    await choose(portal.user, screen.getByLabelText('Role for Rita Rep'), 'manager')
    const save = screen.getByRole('button', { name: 'Save role for Rita Rep' })
    await portal.user.click(save)
    await portal.user.click(save)
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save role for Rita Rep' }).getAttribute('aria-disabled')
      ).toBe('true')
    )
    release()
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Role updated.'))
    const patches = portal.calls.filter((call) => call.method === 'PATCH')
    expect(patches).toHaveLength(1)
    expect(patches[0]?.body).toEqual({ role: 'manager' })
    // Refetched after the change.
    expect(
      portal.calls.filter((call) => call.method === 'GET' && call.path === MEMBERS).length
    ).toBeGreaterThan(1)
  })

  test('an Admin gets only the roles core allows, and no controls on an Owner or another Admin', async () => {
    const portal = visit('admin', list)
    await screen.findByText('Rita Rep')
    const rep = screen.getByLabelText('Role for Rita Rep')
    expect((await optionsOf(portal.user, rep)).map((option) => option.text)).toEqual([
      'Manager',
      'Rep',
    ])
    expect(screen.queryByLabelText('Role for Olive Owner')).toBeNull()
    expect(screen.queryByLabelText('Role for Adam Admin')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove Olive Owner' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Remove Rita Rep' })).toBeTruthy()
  })

  test('a Manager sees the list with no actions at all', async () => {
    visit('manager', list)
    await screen.findByText('Rita Rep')
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Remove|Save role/ })).toBeNull()
  })

  test('the last Owner error is explained beside the control', async () => {
    const portal = visit(
      'owner',
      route(
        'PATCH',
        `${MEMBERS}/${hexId('mem', 1)}`,
        failure(409, CORE_ERRORS['member.last_owner'].code)
      ),
      list
    )
    await screen.findByText('Olive Owner')
    await choose(portal.user, screen.getByLabelText('Role for Olive Owner'), 'rep')
    await portal.user.click(screen.getByRole('button', { name: 'Save role for Olive Owner' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('The last Owner cannot be removed or demoted')
    expect(screen.getByLabelText('Role for Olive Owner').getAttribute('aria-describedby')).toBe(
      alert.id
    )
  })

  test('a 403 on a change is explained and nothing else changes', async () => {
    const portal = visit(
      'owner',
      route('PATCH', `${MEMBERS}/${hexId('mem', 2)}`, failure(403, 'auth.forbidden')),
      list
    )
    await screen.findByText('Rita Rep')
    await choose(portal.user, screen.getByLabelText('Role for Rita Rep'), 'admin')
    await portal.user.click(screen.getByRole('button', { name: 'Save role for Rita Rep' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Your role does not allow this'
    )
    expect(portal.reports).toEqual([])
  })

  test('removing asks first (focus on Cancel), cancel returns focus, confirm sends one request and moves focus to the heading', async () => {
    let removed = false
    const portal = visit(
      'owner',
      route('DELETE', `${MEMBERS}/${hexId('mem', 2)}`, () => {
        removed = true
        return new Response(null, { status: 204 })
      }),
      route('GET', MEMBERS, () =>
        json(
          200,
          page(
            removed
              ? [memberBody(1, { name: 'Olive Owner', role: 'owner' })]
              : [
                  memberBody(1, { name: 'Olive Owner', role: 'owner' }),
                  memberBody(2, { name: 'Rita Rep' }),
                ]
          )
        )
      )
    )
    await screen.findByText('Rita Rep')
    const open = screen.getByRole('button', { name: 'Remove Rita Rep' })
    await portal.user.click(open)
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(document.activeElement === cancel).toBe(true)
    await portal.user.keyboard('{Escape}')
    await waitFor(() =>
      expect(
        document.activeElement === screen.getByRole('button', { name: 'Remove Rita Rep' })
      ).toBe(true)
    )
    expect(portal.calls.some((call) => call.method === 'DELETE')).toBe(false)

    await portal.user.click(screen.getByRole('button', { name: 'Remove Rita Rep' }))
    await portal.user.click(screen.getByRole('button', { name: 'Remove member' }))
    await waitUntilGone('Rita Rep')
    expect(portal.calls.filter((call) => call.method === 'DELETE')).toHaveLength(1)
    expect(screen.getByRole('status').textContent).toBe('Member removed.')
    expect(document.activeElement === screen.getByRole('heading', { name: 'Members' })).toBe(true)
  })

  test('a removal that fails is explained beside the control', async () => {
    const portal = visit(
      'owner',
      route(
        'DELETE',
        `${MEMBERS}/${hexId('mem', 2)}`,
        failure(404, CORE_ERRORS['member.not_found'].code)
      ),
      list
    )
    await screen.findByText('Rita Rep')
    await portal.user.click(screen.getByRole('button', { name: 'Remove Rita Rep' }))
    await portal.user.click(screen.getByRole('button', { name: 'Remove member' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'no longer in your Organization'
    )
  })
})

describe('navigation', () => {
  test.each([
    [
      'owner',
      [
        'Home',
        'Prospects',
        'Inbox',
        'Approvals',
        'Approval policy',
        'Escalation rules',
        'Agent',
        'Calendar',
        'Members',
        'Invitations',
        'Teams',
        'Lines',
        'API keys',
        'Audit log',
        'Data export',
        'Developers',
        'Consent Wording',
        'Suppression',
        'Overview',
        'Campaigns',
        'Reps',
        'Assessments',
        'Playbook sources',
        'Playbook',
        'Sales history',
      ],
    ],
    [
      'admin',
      [
        'Home',
        'Prospects',
        'Inbox',
        'Approvals',
        'Approval policy',
        'Escalation rules',
        'Agent',
        'Calendar',
        'Members',
        'Invitations',
        'Teams',
        'Lines',
        'API keys',
        'Audit log',
        'Data export',
        'Developers',
        'Consent Wording',
        'Suppression',
        'Overview',
        'Campaigns',
        'Reps',
        'Assessments',
        'Playbook sources',
        'Playbook',
        'Sales history',
      ],
    ],
    [
      'manager',
      [
        'Home',
        'Prospects',
        'Inbox',
        'Approvals',
        'Agent',
        'Calendar',
        'Members',
        'Teams',
        'Audit log',
        'Developers',
        'Consent Wording',
        'Overview',
        'Reps',
        'Playbook',
      ],
    ],
    [
      'rep',
      [
        'Home',
        'Prospects',
        'Inbox',
        'Approvals',
        'Calendar',
        'Teams',
        'Developers',
        'Consent Wording',
        'Overview',
        'Your numbers',
        'Playbook',
      ],
    ],
  ] as const)('%s sees %j', async (role, links) => {
    visit(role, route('GET', MEMBERS, json(200, page([]))))
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent)
    ).toEqual([...links])
  })

  test('the current page is marked', async () => {
    visit('owner', route('GET', MEMBERS, json(200, page([]))))
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    await waitFor(() =>
      expect(within(nav).getByRole('link', { name: 'Members' }).getAttribute('aria-current')).toBe(
        'page'
      )
    )
  })
})
