import { afterEach, describe, expect, test } from 'bun:test'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { CORE_ERRORS, SALES_HISTORY_ERRORS } from 'tula-closeline-contract'
import {
  callBody,
  dealBody,
  hexId,
  importBody,
  invitationBody,
  memberBody,
  page,
  rightsBody,
  teamBody,
} from '~/testing/core-bodies'
import { failure, json, route, tokens } from '~/testing/fixtures'
import { completeBody, renderPortal, startedBody } from '~/testing/render'
import { visit } from '~/testing/sales'
import { choose, chosenValue } from '~/testing/select'
import { formatWhen } from '~/ui/When'

const PB = '/v1/playbook'
const CALLS = `${PB}/calls`
const DEALS = `${PB}/deals`
const IMPORTS = `${PB}/deal-imports`
const RIGHTS = `${PB}/rights-confirmation`
const confirmed = route('GET', RIGHTS, json(200, rightsBody()))
const noCalls = route('GET', CALLS, json(200, page([])))

const realZone = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone
afterEach(() => {
  process.env.TZ = realZone
})

describe('run check 1: a date without a time is a date', () => {
  test.each(['America/Chicago', 'Pacific/Auckland'])(
    'the Deals list and a Deal show 2026-01-31 as 31 January in %s',
    async (zone) => {
      process.env.TZ = zone
      const deal = dealBody(1, { outcome: 'won', closedAt: '2026-01-31' })
      visit('/sales-history/deals', 'owner', [
        route('GET', DEALS, json(200, page([deal]))),
        route('GET', `${DEALS}/${deal.id}`, json(200, deal)),
      ])
      const row = (await screen.findByText('D-1')).closest('tr') as HTMLElement
      expect(row.textContent).toContain('Jan 31, 2026')
      expect(row.textContent).not.toMatch(/Jan 30|Feb 1/)
      expect(row.querySelector('time')?.getAttribute('datetime')).toBe('2026-01-31')
    }
  )

  test('a Deal page shows the same date', async () => {
    process.env.TZ = 'America/Chicago'
    const deal = dealBody(1, { outcome: 'won', closedAt: '2026-01-31' })
    visit(`/sales-history/deals/${deal.id}`, 'owner', [
      route('GET', `${DEALS}/${deal.id}`, json(200, deal)),
    ])
    expect((await screen.findByText('Jan 31, 2026')).tagName).toBe('TIME')
  })

  test('any other timestamp, even at exactly midnight UTC, shows local date and time', () => {
    const local = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    expect(formatWhen('2026-10-13T00:00:00Z')).toBe(
      local.format(Date.parse('2026-10-13T00:00:00Z'))
    )
  })
})

describe('run check 2: one feedback state per form', () => {
  test('Teams: a success does not stay next to a later error, and a later success clears an old error', async () => {
    let posts = 0
    const portal = renderPortal({
      url: '/teams',
      signedIn: tokens({ organization: { id: 'org_1', role: 'owner' } }),
      handlers: [
        route('POST', '/v1/teams', () => {
          posts += 1
          return posts === 2
            ? failure(409, CORE_ERRORS['team.name_taken'].code)
            : json(201, teamBody(posts + 5, `New ${posts}`))
        }),
        route(
          'DELETE',
          `/v1/teams/${hexId('team', 1)}`,
          failure(404, CORE_ERRORS['team.not_found'].code)
        ),
        route('GET', '/v1/teams', json(200, page([teamBody(1, 'Northern')]))),
      ],
    })
    const create = async (name: string) => {
      const field = await screen.findByLabelText('Team name')
      await portal.user.clear(field)
      await portal.user.type(field, name)
      await portal.user.click(screen.getByRole('button', { name: 'Create Team' }))
    }
    await create('One')
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Team created.'))
    await create('Two')
    await screen.findByText(/already exists/)
    expect(screen.getByRole('status').textContent).toBe('')
    // An old error beside a control goes away when something else succeeds.
    await portal.user.click(screen.getByRole('button', { name: 'Delete Northern' }))
    await portal.user.click(screen.getByRole('button', { name: 'Delete Team' }))
    await screen.findByText(/no longer exists|already gone|not found/i)
    await create('Three')
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Team created.'))
    expect(screen.queryAllByRole('alert')).toHaveLength(0)
  })

  test('Invitations: a duplicate does not leave "Invitation sent." beside its error', async () => {
    let posts = 0
    const portal = renderPortal({
      url: '/invitations',
      signedIn: tokens({ organization: { id: 'org_1', role: 'owner' } }),
      handlers: [
        route('POST', '/v1/invitations', () => {
          posts += 1
          return posts === 1
            ? json(201, invitationBody(1))
            : failure(409, CORE_ERRORS['invitation.already_pending'].code)
        }),
        route('GET', '/v1/invitations', json(200, page([]))),
      ],
    })
    const send = async () => {
      const field = await screen.findByLabelText('Email address')
      await portal.user.clear(field)
      await portal.user.type(field, 'new@northline.app')
      await portal.user.click(screen.getByRole('button', { name: 'Send Invitation' }))
    }
    await send()
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Invitation sent.'))
    await send()
    await screen.findByText(/already has a pending Invitation/)
    expect(screen.getByRole('status').textContent).toBe('')
  })

  test('Transcript: a refused file shows the error and not "ready to upload"', async () => {
    visit('/sales-history/calls', 'owner', [noCalls, confirmed])
    const input = await screen.findByLabelText(/choose a transcript/i)
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'bad.exe', { type: 'application/x-msdownload' })] },
    })
    await act(async () => {
      screen.getByRole('button', { name: 'Upload Transcript' }).click()
    })
    await screen.findByText(/not supported/)
    expect(document.body.textContent).not.toContain('is ready to upload')
  })

  test('Recording: a file over 500 MB shows the error and not "ready to upload"', async () => {
    visit('/sales-history/calls', 'owner', [noCalls, confirmed])
    const big = new File(['x'], 'big.wav', { type: 'audio/wav' })
    Object.defineProperty(big, 'size', { value: 500 * 1024 * 1024 + 1 })
    fireEvent.change(await screen.findByLabelText(/choose a recording/i), {
      target: { files: [big] },
    })
    await act(async () => {
      screen.getByRole('button', { name: 'Upload Recording' }).click()
    })
    await screen.findAllByText(/larger than 500 MB/)
    expect(document.body.textContent).not.toContain('is ready to upload')
  })

  test('Recording: the old "Uploaded" result goes when another file is chosen', async () => {
    const portal = visit('/sales-history/calls', 'owner', [
      route('POST', CALLS, json(201, callBody(5, { kind: 'recording', mediaType: 'audio/mpeg' }))),
      noCalls,
      confirmed,
    ])
    fireEvent.change(await screen.findByLabelText(/choose a recording/i), {
      target: { files: [new File(['ID3'], 'one.mp3', { type: 'audio/mpeg' })] },
    })
    await portal.user.type(screen.getByLabelText(/deal id for the Recording/), 'D-1')
    await portal.user.click(screen.getByRole('button', { name: 'Upload Recording' }))
    const status = () => screen.getByRole('status', { name: 'Recording upload' })
    await waitFor(() => expect(status().textContent).toMatch(/Uploaded one\.mp3/))
    fireEvent.change(screen.getByLabelText(/choose a recording/i), {
      target: { files: [new File(['ID3'], 'two.mp3', { type: 'audio/mpeg' })] },
    })
    await waitFor(() => expect(status().textContent).toBe(''))
  })
})

describe('run check 3: a finished upload resets the form', () => {
  test('after a Recording is stored the chooser is empty and a second click sends nothing', async () => {
    const portal = visit('/sales-history/calls', 'owner', [
      route('POST', CALLS, json(201, callBody(5, { kind: 'recording', mediaType: 'audio/mpeg' }))),
      noCalls,
      confirmed,
    ])
    const before = await screen.findByLabelText(/choose a recording/i)
    fireEvent.change(before, {
      target: { files: [new File(['ID3'], 'one.mp3', { type: 'audio/mpeg' })] },
    })
    await portal.user.type(screen.getByLabelText(/deal id for the Recording/), 'D-1')
    await portal.user.click(screen.getByRole('button', { name: 'Upload Recording' }))
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Recording upload' }).textContent).toMatch(
        /Uploaded one\.mp3/
      )
    )
    const after = screen.getByLabelText(/choose a recording/i) as HTMLInputElement
    expect(after.files?.length ?? 0).toBe(0)
    expect(after.value).toBe('')
    expect(screen.queryByText(/one\.mp3 is ready/)).toBeNull()
    await portal.user.click(screen.getByRole('button', { name: 'Upload Recording' }))
    expect(
      portal.calls.filter((call) => call.method === 'POST' && call.path === CALLS)
    ).toHaveLength(1)
  })
})

describe('run check 4: a failed removal on Members', () => {
  test('puts the role choice back and shows the error in its own row, not in the Actions cell', async () => {
    const portal = renderPortal({
      url: '/members',
      signedIn: tokens({ organization: { id: 'org_1', role: 'owner' } }),
      handlers: [
        route(
          'DELETE',
          `/v1/members/${hexId('mem', 2)}`,
          failure(404, CORE_ERRORS['member.not_found'].code)
        ),
        route(
          'GET',
          '/v1/members',
          json(200, page([memberBody(2, { name: 'Rita Rep', role: 'rep' })]))
        ),
      ],
    })
    await screen.findByText('Rita Rep')
    const select = screen.getByLabelText('Role for Rita Rep')
    await choose(portal.user, select, 'manager')
    expect(chosenValue(select)).toBe('manager')
    await portal.user.click(screen.getByRole('button', { name: 'Remove Rita Rep' }))
    await portal.user.click(screen.getByRole('button', { name: 'Remove member' }))
    const alert = await screen.findByRole('alert')
    expect(chosenValue(screen.getByLabelText('Role for Rita Rep'))).toBe('rep')
    expect(alert.closest('td')?.getAttribute('colspan')).not.toBeNull()
    expect(select.getAttribute('aria-describedby')).toBe(alert.id)
  })
})

describe('run check 5: Teams member feedback sits with the controls', () => {
  test('a removal result appears inside the members panel, not at the top of the page', async () => {
    const path = `/v1/teams/${hexId('team', 1)}/members/${hexId('mem', 1)}`
    const portal = renderPortal({
      url: '/teams',
      signedIn: tokens({ organization: { id: 'org_1', role: 'owner' } }),
      handlers: [
        route('DELETE', path, () => new Response(null, { status: 204 })),
        route('GET', '/v1/teams', json(200, page([teamBody(1, 'Northern')]))),
        route('GET', '/v1/members', json(200, page([memberBody(1, { name: 'Maya Chen' })]))),
      ],
    })
    await screen.findByText('Northern')
    await portal.user.click(screen.getByRole('button', { name: 'Members of Northern' }))
    await portal.user.click(await screen.findByRole('button', { name: 'Remove from Team' }))
    const panel = screen.getByRole('region', { name: 'Members of Northern' })
    await within(panel).findByText('Member removed from the Team.')
    expect(screen.getAllByRole('status')[0]?.textContent).toBe('')
  })
})

describe('run check 6: Calls says upfront that the rights come first', () => {
  test('shows the notice with a link when the rights are not confirmed', async () => {
    visit('/sales-history/calls', 'owner', [
      noCalls,
      route('GET', RIGHTS, json(200, rightsBody({ confirmedVersion: null }))),
    ])
    const link = await screen.findByRole('link', { name: 'Confirm the rights' })
    expect(link.getAttribute('href')).toBe('/sales-history/rights?from=%2Fsales-history%2Fcalls')
    expect(screen.getByText(/before you upload anything/i)).toBeTruthy()
  })

  test('shows no notice once they are confirmed', async () => {
    visit('/sales-history/calls', 'owner', [noCalls, confirmed])
    await screen.findByLabelText(/choose a transcript/i)
    await waitFor(() => expect(screen.queryByText(/before you upload/i)).toBeNull())
  })
})

describe('run check 8: an import with no report yet has no Report link', () => {
  test('uploaded and processing imports say so; finished ones link to the report', async () => {
    visit('/sales-history/imports', 'owner', [
      route(
        'GET',
        IMPORTS,
        json(
          200,
          page([
            importBody(1, {
              state: 'uploaded',
              rowCount: null,
              appliedCount: null,
              rejectedCount: null,
            }),
            importBody(2, {
              state: 'processing',
              rowCount: null,
              appliedCount: null,
              rejectedCount: null,
            }),
            importBody(3, { state: 'completed' }),
          ])
        )
      ),
    ])
    await screen.findByText('Uploaded, waiting to start')
    expect(screen.getAllByRole('link', { name: /^Report/ })).toHaveLength(1)
    expect(screen.getAllByText('Not ready yet')).toHaveLength(2)
  })
})

describe('run check 9: a signed-out deep link comes back after sign-in', () => {
  const started = route(
    'POST',
    '/v1/client/sign-ins',
    json(200, startedBody('sign_in', 'needs_password'))
  )
  const signedIn = route(
    'POST',
    '/v1/client/sign-ins/att_1/password',
    json(200, completeBody('sign_in', tokens({ organization: { id: 'org_1', role: 'owner' } })))
  )

  async function signIn(portal: ReturnType<typeof renderPortal>) {
    await portal.user.type(await screen.findByLabelText('Email address'), 'maya@northline.app')
    await portal.user.type(screen.getByLabelText('Password'), 'correct horse battery')
    await portal.user.click(screen.getByRole('button', { name: 'Sign in' }))
  }

  test('the page that was asked for opens after sign-in', async () => {
    const portal = renderPortal({
      url: '/sales-history/deals',
      handlers: [started, signedIn, route('GET', DEALS, json(200, page([]))), confirmed],
    })
    await signIn(portal)
    expect(await screen.findByRole('heading', { name: 'Deals' })).toBeTruthy()
    expect(portal.router.state.location.pathname).toBe('/sales-history/deals')
  })

  test.each([
    ['//evil.example/x'],
    ['https://evil.example/'],
    ['/\\evil.example'],
    ['javascript:alert(1)'],
    ['/sign-in'],
  ])('a return address of %s is ignored and the person lands on Home', async (target) => {
    const portal = renderPortal({
      url: `/sign-in?redirect=${encodeURIComponent(target)}`,
      handlers: [started, signedIn],
    })
    await signIn(portal)
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()
    expect(portal.router.state.location.pathname).toBe('/')
  })
})

describe('run check 10: Cancel always says Cancelled', () => {
  test('even when the browser reports a network error as the request is cut off', async () => {
    const portal = visit('/sales-history/calls', 'owner', [
      route(
        'POST',
        CALLS,
        (made) =>
          new Promise<Response>((_resolve, reject) => {
            made.init.signal?.addEventListener('abort', () => reject(new TypeError('network')))
          })
      ),
      noCalls,
      confirmed,
    ])
    fireEvent.change(await screen.findByLabelText(/choose a recording/i), {
      target: { files: [new File(['ID3'], 'one.mp3', { type: 'audio/mpeg' })] },
    })
    await portal.user.type(screen.getByLabelText(/deal id for the Recording/), 'D-1')
    await portal.user.click(screen.getByRole('button', { name: 'Upload Recording' }))
    await portal.user.click(
      await screen.findByRole('button', { name: /Cancel upload of one\.mp3/ })
    )
    const status = screen.getByRole('status', { name: 'Recording upload' })
    await waitFor(() => expect(status.textContent).toMatch(/Cancelled/))
    expect(status.textContent).not.toMatch(/Could not reach/)
  })

  test('a Cancel pressed while the answer is already an error still says Cancelled', async () => {
    const portal = visit('/sales-history/calls', 'owner', [
      route(
        'POST',
        CALLS,
        (made) =>
          new Promise<Response>((resolve) => {
            made.init.signal?.addEventListener('abort', () =>
              resolve(failure(413, SALES_HISTORY_ERRORS['call.too_large'].code))
            )
          })
      ),
      noCalls,
      confirmed,
    ])
    fireEvent.change(await screen.findByLabelText(/choose a recording/i), {
      target: { files: [new File(['ID3'], 'one.mp3', { type: 'audio/mpeg' })] },
    })
    await portal.user.type(screen.getByLabelText(/deal id for the Recording/), 'D-1')
    await portal.user.click(screen.getByRole('button', { name: 'Upload Recording' }))
    await portal.user.click(
      await screen.findByRole('button', { name: /Cancel upload of one\.mp3/ })
    )
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Recording upload' }).textContent).toMatch(
        /Cancelled/
      )
    )
  })
})

describe('run check 4 (core): last Owner, and removing from a Team with a key', () => {
  const teamsList = route('GET', '/v1/teams', json(200, page([teamBody(1, 'Northern')])))
  const membersList = route(
    'GET',
    '/v1/members',
    json(200, page([memberBody(1, { name: 'Maya Chen' })]))
  )
  const path = `/v1/teams/${hexId('team', 1)}/members/${hexId('mem', 1)}`
  const team = (...handlers: ReturnType<typeof route>[]) =>
    renderPortal({
      url: '/teams',
      signedIn: tokens({ organization: { id: 'org_1', role: 'owner' } }),
      handlers: [...handlers, teamsList, membersList],
    })
  const openPanel = async (portal: ReturnType<typeof team>) => {
    await screen.findByText('Northern')
    await portal.user.click(screen.getByRole('button', { name: 'Members of Northern' }))
    await screen.findByLabelText('Member')
  }
  const keys = (portal: ReturnType<typeof team>) =>
    portal.calls
      .filter((call) => call.method === 'DELETE')
      .map((c) => c.headers.get('idempotency-key'))

  test("member.last_owner says to promote another Owner, on that Owner's own row", async () => {
    const portal = renderPortal({
      url: '/members',
      signedIn: tokens({ organization: { id: 'org_1', role: 'owner' } }),
      handlers: [
        route(
          'DELETE',
          `/v1/members/${hexId('mem', 1)}`,
          failure(409, CORE_ERRORS['member.last_owner'].code)
        ),
        route(
          'GET',
          '/v1/members',
          json(
            200,
            page([
              memberBody(1, { name: 'Olive Owner', role: 'owner' }),
              memberBody(2, { name: 'Rita Rep', role: 'rep' }),
            ])
          )
        ),
      ],
    })
    await screen.findByText('Olive Owner')
    await portal.user.click(screen.getByRole('button', { name: 'Remove Olive Owner' }))
    await portal.user.click(screen.getByRole('button', { name: 'Remove member' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Promote another Owner first')
    const row = alert.closest('tr')?.previousElementSibling as HTMLElement
    expect(within(row).getByText('Olive Owner')).toBeTruthy()
  })

  test('each remove sends a fresh Idempotency-Key, and a retry after a lost answer reuses it', async () => {
    let attempts = 0
    const portal = team(
      route('DELETE', path, () => {
        attempts += 1
        if (attempts === 1) {
          throw new TypeError('network down')
        }
        return new Response(null, { status: 204 })
      })
    )
    await openPanel(portal)
    const remove = () => screen.getByRole('button', { name: 'Remove from Team' })
    await portal.user.click(remove())
    await screen.findByText(/Could not reach Closeline/)
    await portal.user.click(remove())
    await screen.findByText('Member removed from the Team.')
    await portal.user.click(remove())
    await waitFor(() => expect(keys(portal)).toHaveLength(3))
    const [first, retry, next] = keys(portal)
    expect(first).toMatch(/^portal-/)
    expect(retry).toBe(first)
    expect(next).not.toBe(first)
  })

  test('a 404 member.not_found on a Team remove is "already not in this Team", not an error', async () => {
    const portal = team(route('DELETE', path, failure(404, CORE_ERRORS['member.not_found'].code)))
    await openPanel(portal)
    await portal.user.click(screen.getByRole('button', { name: 'Remove from Team' }))
    const panel = screen.getByRole('region', { name: 'Members of Northern' })
    await within(panel).findByText(/already not in this Team/)
    expect(within(panel).queryByRole('alert')).toBeNull()
  })
})

describe('run check 5 (follow-up): a screen notice does not outlive a members panel action', () => {
  test('after "Team renamed.", a member removal clears the notice at the top', async () => {
    const portal = renderPortal({
      url: '/teams',
      signedIn: tokens({ organization: { id: 'org_1', role: 'owner' } }),
      handlers: [
        route('PATCH', `/v1/teams/${hexId('team', 1)}`, json(200, teamBody(1, 'Renamed'))),
        route(
          'DELETE',
          `/v1/teams/${hexId('team', 1)}/members/${hexId('mem', 1)}`,
          () => new Response(null, { status: 204 })
        ),
        route('GET', '/v1/teams', json(200, page([teamBody(1, 'Northern')]))),
        route('GET', '/v1/members', json(200, page([memberBody(1, { name: 'Maya Chen' })]))),
      ],
    })
    await screen.findByText('Northern')
    await portal.user.click(screen.getByRole('button', { name: 'Rename Northern' }))
    const field = await screen.findByLabelText('New Team name')
    await portal.user.clear(field)
    await portal.user.type(field, 'Renamed')
    await portal.user.click(screen.getByRole('button', { name: 'Save name' }))
    await waitFor(() => expect(screen.getAllByRole('status')[0]?.textContent).toBe('Team renamed.'))
    await portal.user.click(screen.getByRole('button', { name: /Members of/ }))
    await portal.user.click(await screen.findByRole('button', { name: 'Remove from Team' }))
    await screen.findByText('Member removed from the Team.')
    expect(screen.getAllByRole('status')[0]?.textContent).toBe('')
  })
})

describe('review follow-ups', () => {
  test('after an explicit sign-out the sign-in page carries no return address', async () => {
    const portal = renderPortal({
      url: '/teams',
      signedIn: tokens({ organization: { id: 'org_1', role: 'owner' } }),
      handlers: [
        route('POST', '/v1/client/sessions/sign-out', new Response(null, { status: 204 })),
        route('GET', '/v1/teams', json(200, page([]))),
      ],
    })
    await screen.findByRole('heading', { name: 'Teams' })
    await portal.user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(portal.router.state.location.pathname).toBe('/sign-in')
    expect(portal.router.state.location.searchStr).toBe('')
  })

  test('a removal with an unknown outcome, then add, then remove again: the second removal has a new key', async () => {
    const base = `/v1/teams/${hexId('team', 1)}/members`
    let removals = 0
    const portal = renderPortal({
      url: '/teams',
      signedIn: tokens({ organization: { id: 'org_1', role: 'owner' } }),
      handlers: [
        route('DELETE', `${base}/${hexId('mem', 1)}`, () => {
          removals += 1
          if (removals === 1) {
            throw new TypeError('network down')
          }
          return new Response(null, { status: 204 })
        }),
        route(
          'POST',
          base,
          json(200, {
            teamId: hexId('team', 1),
            membershipId: hexId('mem', 1),
            createdAt: '2026-10-13T00:00:00Z',
          })
        ),
        route('GET', '/v1/teams', json(200, page([teamBody(1, 'Northern')]))),
        route('GET', '/v1/members', json(200, page([memberBody(1, { name: 'Maya Chen' })]))),
      ],
    })
    await screen.findByText('Northern')
    await portal.user.click(screen.getByRole('button', { name: 'Members of Northern' }))
    await screen.findByLabelText('Member')
    await portal.user.click(screen.getByRole('button', { name: 'Remove from Team' }))
    await screen.findByText(/Could not reach Closeline/)
    await portal.user.click(screen.getByRole('button', { name: 'Add to Team' }))
    await screen.findByText('Member added to the Team.')
    await portal.user.click(screen.getByRole('button', { name: 'Remove from Team' }))
    await waitFor(() =>
      expect(portal.calls.filter((call) => call.method === 'DELETE')).toHaveLength(2)
    )
    const [first, second] = portal.calls
      .filter((call) => call.method === 'DELETE')
      .map((call) => call.headers.get('idempotency-key'))
    expect(second).not.toBe(first)
  })
})
