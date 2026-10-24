import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { screen, waitFor, within } from '@testing-library/react'
import { AUDIT_ERRORS } from 'tula-closeline-contract'
import { auditEventBody } from '~/testing/audit-bodies'
import { hexId, page, teamBody } from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'
import { choose } from '~/testing/select'

const EVENTS = '/v1/audit-events'
const CSV = '/v1/audit-csv'
const VERIFY = '/v1/audit-verification'

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', ...handlers: Handler[]) {
  return renderPortal({
    url: '/audit',
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers,
  })
}

const events = route(
  'GET',
  EVENTS,
  json(
    200,
    page([
      auditEventBody(2, { action: 'prospect.deleted' }),
      auditEventBody(1, {
        actor: { kind: 'agent', agentKind: 'outbound' },
        action: 'message.sent',
        metadata: { channel: 'email', count: 1, dryRun: false },
      }),
    ])
  )
)

describe('Audit log: who may see it', () => {
  test('a Rep sees a notice, no events, and nothing is requested', async () => {
    const portal = visit('rep', events)
    expect(
      await screen.findByText(/Only an Owner, Admin or Manager can read the audit log/)
    ).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Audit events' })).toBeNull()
    expect(portal.calls.some((call) => call.path.startsWith('/v1/audit'))).toBe(false)
  })

  test.each(['rep'] as const)('the nav link is hidden from a %s', async (role) => {
    renderPortal({
      url: '/teams',
      signedIn: tokens({ organization: { id: 'org_1', role } }),
      handlers: [route('GET', '/v1/teams', json(200, page([teamBody(1, 'Northern')])))],
    })
    await screen.findByRole('list', { name: 'Teams' })
    expect(screen.queryByRole('link', { name: 'Audit log' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Data export' })).toBeNull()
  })

  test('a Manager reads the log but has no CSV and no chain check', async () => {
    visit('manager', events)
    await screen.findByRole('list', { name: 'Audit events' })
    expect(screen.queryByRole('button', { name: /Download CSV/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Check the chain/ })).toBeNull()
  })

  test.each(['owner', 'admin'] as const)('an %s has the CSV and the chain check', async (role) => {
    visit(role, events)
    await screen.findByRole('list', { name: 'Audit events' })
    expect(screen.getByRole('button', { name: /Download CSV/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Check the chain/ })).toBeTruthy()
  })
})

describe('Audit log: the list', () => {
  test('shows the actor, action, subject and ids only, never a Message text', async () => {
    visit('admin', events)
    const list = await screen.findByRole('list', { name: 'Audit events' })
    const sent = within(list).getByText('message.sent').closest('li') as HTMLElement
    expect(within(sent).getByText(/Outbound Agent/)).toBeTruthy()
    expect(within(sent).getByText('channel')).toBeTruthy()
    expect(within(sent).getByText('email')).toBeTruthy()
    const deleted = within(list).getByText('prospect.deleted').closest('li') as HTMLElement
    expect(within(deleted).getByText(/Member/)).toBeTruthy()
    expect(within(deleted).getByText(/Prospect/)).toBeTruthy()
  })

  test('an event carrying a content key is refused, so its text never shows', async () => {
    visit(
      'admin',
      route(
        'GET',
        EVENTS,
        json(200, page([auditEventBody(1, { metadata: { messageBody: 'Hi, here is my offer' } })]))
      )
    )
    await screen.findByRole('alert')
    expect(screen.queryByText(/here is my offer/)).toBeNull()
  })

  test('says when there are none', async () => {
    visit('owner', route('GET', EVENTS, json(200, page([]))))
    expect(await screen.findByText('There are no audit events for these filters.')).toBeTruthy()
  })

  test('says what went wrong and offers to try again', async () => {
    visit('owner', route('GET', EVENTS, failure(503, 'server.unavailable')))
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  test('loads the next page with its cursor', async () => {
    const portal = visit('owner', (call) => {
      if (call.path !== EVENTS) {
        return null
      }
      return new URL(call.url, 'http://x.test').searchParams.get('cursor') === 'c2'
        ? json(200, page([auditEventBody(1, { action: 'team.created' })]))
        : json(200, page([auditEventBody(2, { action: 'team.deleted' })], 'c2'))
    })
    await screen.findByText('team.deleted')
    await portal.user.click(screen.getByRole('button', { name: 'Load more events' }))
    expect(await screen.findByText('team.created')).toBeTruthy()
    expect(screen.getByText('team.deleted')).toBeTruthy()
  })
})

describe('Audit log: filters', () => {
  test('send the chosen filters to core and start again from the first page', async () => {
    const portal = visit('admin', events)
    await screen.findByRole('list', { name: 'Audit events' })
    await choose(portal.user, screen.getByRole('combobox', { name: 'Actor' }), 'agent')
    await portal.user.type(screen.getByLabelText('Action'), 'message.sent')
    await portal.user.type(screen.getByLabelText('From'), '2026-10-01')
    await portal.user.type(screen.getByLabelText('To'), '2026-10-05')
    await portal.user.click(screen.getByRole('button', { name: 'Apply filters' }))
    await waitFor(() => {
      const last = portal.calls.filter((call) => call.path === EVENTS).at(-1)
      const query = new URL(last?.url ?? '', 'http://x.test').searchParams
      expect(query.get('actorKind')).toBe('agent')
      expect(query.get('action')).toBe('message.sent')
      expect(query.get('from')).toBe('2026-10-01T00:00:00.000Z')
      expect(query.get('to')).toBe('2026-10-05T23:59:59.999Z')
      expect(query.get('cursor')).toBeNull()
    })
  })

  test('refuse a range longer than 366 days without asking core', async () => {
    const portal = visit('admin', events)
    await screen.findByRole('list', { name: 'Audit events' })
    const before = portal.calls.length
    await portal.user.type(screen.getByLabelText('From'), '2025-01-01')
    await portal.user.type(screen.getByLabelText('To'), '2026-10-05')
    await portal.user.click(screen.getByRole('button', { name: 'Apply filters' }))
    expect(await screen.findByText(/longer than 366 days/)).toBeTruthy()
    expect(portal.calls.length).toBe(before)
  })

  test('refuse an action that is not area.verb', async () => {
    const portal = visit('admin', events)
    await screen.findByRole('list', { name: 'Audit events' })
    await portal.user.type(screen.getByLabelText('Action'), 'Prospect')
    await portal.user.click(screen.getByRole('button', { name: 'Apply filters' }))
    expect(
      await screen.findByText(/area\.verb/, {
        selector: '.audit-filter-problem *, .audit-filter-problem',
      })
    ).toBeTruthy()
  })

  test('core refusing the range is said in words', async () => {
    visit('admin', route('GET', EVENTS, failure(422, AUDIT_ERRORS['audit.range_too_large'].code)))
    expect(await screen.findByText(/longer than 366 days/)).toBeTruthy()
  })

  test('clearing empties the fields and shows the unfiltered list again', async () => {
    const portal = visit('admin', events)
    await screen.findByRole('list', { name: 'Audit events' })
    await portal.user.type(screen.getByLabelText('Action'), 'message.sent')
    await portal.user.click(screen.getByRole('button', { name: 'Apply filters' }))
    await waitFor(() =>
      expect(portal.calls.some((call) => call.url.includes('action=message.sent'))).toBe(true)
    )
    await portal.user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() =>
      expect((screen.getByLabelText('Action') as HTMLInputElement).value).toBe('')
    )
    expect(screen.getByRole('list', { name: 'Audit events' })).toBeTruthy()
  })
})

describe('Audit log: the hash chain', () => {
  test('says the chain is intact after a pass', async () => {
    const portal = visit(
      'owner',
      events,
      route(
        'GET',
        VERIFY,
        json(200, { checked: 12, firstBrokenSequence: null, nextSequence: null })
      )
    )
    await screen.findByRole('list', { name: 'Audit events' })
    await portal.user.click(screen.getByRole('button', { name: 'Check the chain' }))
    expect(await screen.findByText(/Checked 12 events\. The chain is intact\./)).toBeTruthy()
  })

  test('names the first broken sequence', async () => {
    const portal = visit(
      'owner',
      events,
      route('GET', VERIFY, json(200, { checked: 5, firstBrokenSequence: 5, nextSequence: null }))
    )
    await screen.findByRole('list', { name: 'Audit events' })
    await portal.user.click(screen.getByRole('button', { name: 'Check the chain' }))
    expect(await screen.findByText(/broken at sequence 5/)).toBeTruthy()
  })

  test('continues from the next sequence and adds up what was checked', async () => {
    const portal = visit('owner', events, (call) => {
      if (call.path !== VERIFY) {
        return null
      }
      const from = new URL(call.url, 'http://x.test').searchParams.get('fromSequence')
      return from === '1001'
        ? json(200, { checked: 40, firstBrokenSequence: null, nextSequence: null })
        : json(200, { checked: 1000, firstBrokenSequence: null, nextSequence: 1001 })
    })
    await screen.findByRole('list', { name: 'Audit events' })
    await portal.user.click(screen.getByRole('button', { name: 'Check the chain' }))
    await portal.user.click(await screen.findByRole('button', { name: 'Check the next 1000' }))
    expect(await screen.findByText(/Checked 1040 events\. The chain is intact\./)).toBeTruthy()
  })
})

describe('Audit log: CSV', () => {
  const originals = {
    create: URL.createObjectURL,
    revoke: URL.revokeObjectURL,
    click: HTMLAnchorElement.prototype.click,
  }
  beforeEach(() => {
    HTMLAnchorElement.prototype.click = () => {}
    URL.revokeObjectURL = () => {}
  })
  afterEach(() => {
    URL.createObjectURL = originals.create
    URL.revokeObjectURL = originals.revoke
    HTMLAnchorElement.prototype.click = originals.click
  })

  test('joins the pages into one file, keeping the filters and dropping repeated headers', async () => {
    let blob: Blob | undefined
    URL.createObjectURL = (made: Blob | MediaSource) => {
      blob = made as Blob
      return 'blob:audit'
    }
    const portal = visit('admin', events, (call) => {
      if (call.path !== CSV) {
        return null
      }
      const cursor = new URL(call.url, 'http://x.test').searchParams.get('cursor')
      return cursor === 'p2'
        ? new Response('id,action\naud_2,b.c\n', { headers: { 'content-type': 'text/csv' } })
        : new Response('id,action\naud_1,a.b\n', {
            headers: { 'content-type': 'text/csv', 'x-next-cursor': 'p2' },
          })
    })
    await screen.findByRole('list', { name: 'Audit events' })
    await portal.user.type(screen.getByLabelText('Action'), 'a.b')
    await portal.user.click(screen.getByRole('button', { name: 'Apply filters' }))
    await portal.user.click(screen.getByRole('button', { name: /Download CSV/ }))
    await waitFor(() => expect(blob).toBeDefined())
    expect(await blob?.text()).toBe('id,action\naud_1,a.b\naud_2,b.c\n')
    const csvCalls = portal.calls.filter((call) => call.path === CSV)
    expect(csvCalls.length).toBe(2)
    expect(new URL(csvCalls[0]?.url ?? '', 'http://x.test').searchParams.get('action')).toBe('a.b')
  })

  test('a failure is said and the button works again', async () => {
    const portal = visit('admin', events, route('GET', CSV, failure(503, 'server.unavailable')))
    await screen.findByRole('list', { name: 'Audit events' })
    await portal.user.click(screen.getByRole('button', { name: /Download CSV/ }))
    expect(await screen.findByText(/try again/i)).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /Download CSV/ }).getAttribute('aria-disabled')
    ).not.toBe('true')
  })
})

test('the ids shown are the ones core sent', async () => {
  visit('admin', events)
  const list = await screen.findByRole('list', { name: 'Audit events' })
  expect(within(list).getAllByText(new RegExp(hexId('mem', 1).slice(0, 8))).length).toBeGreaterThan(
    0
  )
})
