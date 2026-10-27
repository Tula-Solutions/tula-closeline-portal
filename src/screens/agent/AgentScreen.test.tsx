import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { hexId, page } from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const BASE = '/v1/agent-instructions/inbound'
const CONTROLS = '/v1/agent-controls'
const PAUSE = `${CONTROLS}/organization-pause`
const NOW = '2026-10-01T10:00:00.000Z'
const MEMBER = hexId('mem', 1)

const versionBody = (number: number, text: string, state: 'draft' | 'published') => ({
  id: `ains_${number.toString(16).padStart(32, '0')}`,
  agentKind: 'inbound',
  number,
  state,
  authorMembershipId: MEMBER,
  createdAt: NOW,
  publishedAt: state === 'published' ? NOW : null,
  text,
})
const summary = (number: number, state: 'draft' | 'published', wasLive = state === 'published') => {
  const { text, ...rest } = versionBody(number, 'x'.repeat(10 * number), state)
  return { ...rest, publishedAt: wasLive ? NOW : null, length: text.length }
}

const published = route(
  'GET',
  `${BASE}/published`,
  json(200, {
    agentKind: 'inbound',
    version: versionBody(2, 'Be brief <b>and</b> kind.', 'published'),
  })
)
const versions = route(
  'GET',
  `${BASE}/versions`,
  json(200, page([summary(3, 'draft'), summary(2, 'published'), summary(1, 'draft', true)]))
)
const day = (name: string) => ({ day: name, windows: [{ start: '09:00', end: '17:00' }] })
const control = (channel: string | null, level: string) => ({
  agentKind: 'inbound',
  channel,
  level,
  sendWindow: { timeZone: 'Europe/London', days: [day('mon'), day('tue')] },
  escalationRules: [{ trigger: 'pricing_question', action: 'hand_over' }],
  updatedAt: NOW,
  updatedByMembershipId: MEMBER,
})
const controls = route(
  'GET',
  CONTROLS,
  json(200, page([control(null, 'assisted'), control('email', 'autonomous')]))
)
const running = route(
  'GET',
  PAUSE,
  json(200, { paused: false, updatedAt: null, updatedByMembershipId: null })
)
const all = [published, versions, controls, running]

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', ...handlers: Handler[]) {
  return renderPortal({
    url: '/agent',
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers,
  })
}

afterEach(() => {
  document.documentElement.classList.remove('dark')
  cleanup()
})

describe('Agent: who can open it', () => {
  test('a Rep gets a notice, no request and no nav link', async () => {
    const portal = visit('rep', ...all)
    expect(await screen.findByText(/Only an Owner, Admin or Manager/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Agent' })).toBeNull()
    expect(portal.calls.filter((call) => call.path.startsWith('/v1/agent'))).toHaveLength(0)
  })

  test('a Manager reads the published text and the settings but cannot write', async () => {
    const portal = visit('manager', ...all)
    expect(await screen.findByText('Be brief <b>and</b> kind.')).toBeTruthy()
    await screen.findByRole('list', { name: 'Control levels' })
    expect(screen.getByRole('link', { name: 'Agent' })).toBeTruthy()
    expect(screen.queryByLabelText('Instructions')).toBeNull()
    expect(screen.queryByRole('list', { name: 'Versions' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: /pause all|resume|edit|set|publish|roll back/i })
    ).toBeNull()
    expect(portal.calls.every((call) => call.method === 'GET')).toBe(true)
    expect(portal.calls.some((call) => call.path.endsWith('/versions'))).toBe(false)
  })

  test('there is no switch for Contact Consent or the AI and recording disclosure', async () => {
    visit('owner', ...all)
    await screen.findByRole('list', { name: 'Control levels' })
    const rules = within(screen.getByRole('region', { name: 'Fixed rules' }))
    expect(rules.getByText(/Contact Consent/)).toBeTruthy()
    expect(rules.getByText(/AI and that it is recorded/)).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: /consent|disclos|record/i })).toBeNull()
  })
})

describe('Agent: instructions', () => {
  test('saves the text as a new draft with an idempotency key', async () => {
    const portal = visit(
      'admin',
      route('POST', `${BASE}/versions`, json(201, versionBody(4, 'New text', 'draft'))),
      ...all
    )
    const field = await screen.findByLabelText('Instructions')
    await portal.user.clear(field)
    await portal.user.type(field, 'New text')
    await portal.user.click(screen.getByRole('button', { name: 'Save as new draft' }))
    await screen.findByText(/Saved as a new draft/)
    const post = portal.calls.find((call) => call.method === 'POST')
    expect(post?.body).toEqual({ text: 'New text' })
    expect(post?.headers.get('idempotency-key')).toBeTruthy()
  })

  test('refuses empty text before anything is sent', async () => {
    const portal = visit('owner', published, versions, controls, running)
    const field = await screen.findByLabelText('Instructions')
    await portal.user.clear(field)
    await portal.user.click(screen.getByRole('button', { name: 'Save as new draft' }))
    expect(await screen.findByText(/Write the instructions/)).toBeTruthy()
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
  })

  test('words a refusal by its code', async () => {
    const portal = visit(
      'owner',
      route('POST', `${BASE}/versions`, failure(422, 'agent.instruction_too_long')),
      ...all
    )
    await screen.findByLabelText('Instructions')
    await portal.user.click(screen.getByRole('button', { name: 'Save as new draft' }))
    expect(await screen.findByText(/Keep the instructions to 20000 characters/)).toBeTruthy()
  })

  test('shows a comparison with the published version, marked by sign and not colour', async () => {
    const portal = visit(
      'owner',
      route(
        'GET',
        `${BASE}/diff`,
        json(200, {
          agentKind: 'inbound',
          from: 2,
          to: 3,
          lines: [
            { kind: 'same', text: 'Be brief' },
            { kind: 'removed', text: 'old line' },
            { kind: 'added', text: 'new line' },
          ],
        })
      ),
      ...all
    )
    await screen.findByRole('list', { name: 'Versions' })
    await portal.user.click(
      screen.getByRole('button', { name: 'Compare version 3 with the published version' })
    )
    const lines = within(await screen.findByRole('list', { name: 'Differences' }))
    expect(lines.getByText('Removed:')).toBeTruthy()
    expect(lines.getByText('Added:')).toBeTruthy()
    const call = portal.calls.find((c) => c.path.endsWith('/diff'))
    expect(call?.url).toContain('from=2')
    expect(call?.url).toContain('to=3')
  })

  test('publishes a newer draft only after a confirmation that says what changes', async () => {
    const portal = visit(
      'owner',
      route('POST', `${BASE}/versions/3/publish`, json(200, versionBody(3, 'x', 'published'))),
      ...all
    )
    await screen.findByRole('list', { name: 'Versions' })
    await portal.user.click(screen.getByRole('button', { name: 'Publish version 3' }))
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
    expect(
      screen.getAllByText(/those under way finish on the version they started with/).length
    ).toBeGreaterThan(0)
    await portal.user.click(screen.getByRole('button', { name: 'Publish version 3' }))
    await screen.findByText('Version 3 is published.')
    expect(
      portal.calls.find((call) => call.method === 'POST')?.headers.get('idempotency-key')
    ).toBeTruthy()
  })

  test('an earlier version is a rollback, confirmed and worded as one', async () => {
    const portal = visit(
      'admin',
      route('POST', `${BASE}/versions/1/publish`, json(200, versionBody(1, 'x', 'published'))),
      ...all
    )
    await screen.findByRole('list', { name: 'Versions' })
    await portal.user.click(screen.getByRole('button', { name: 'Roll back version 1' }))
    expect(screen.getByText(/recorded in the audit log/)).toBeTruthy()
    await portal.user.click(screen.getByRole('button', { name: 'Roll back to version 1' }))
    await screen.findByText('Rolled back to version 1.')
  })

  test('a version that no longer exists is worded by its code', async () => {
    const portal = visit(
      'owner',
      route('POST', `${BASE}/versions/3/publish`, failure(404, 'agent.version_not_found')),
      ...all
    )
    await screen.findByRole('list', { name: 'Versions' })
    await portal.user.click(screen.getByRole('button', { name: 'Publish version 3' }))
    await portal.user.click(screen.getByRole('button', { name: 'Publish version 3' }))
    expect(await screen.findByText(/That version no longer exists/)).toBeTruthy()
  })
})

describe('Agent: rollback wording', () => {
  test('a never-published draft is published, an earlier live version is rolled back to', async () => {
    visit(
      'owner',
      route(
        'GET',
        `${BASE}/published`,
        json(200, { agentKind: 'inbound', version: versionBody(3, 'Newest', 'published') })
      ),
      route(
        'GET',
        `${BASE}/versions`,
        json(200, page([summary(3, 'published'), summary(2, 'draft'), summary(1, 'draft', true)]))
      ),
      controls,
      running
    )
    await screen.findByRole('list', { name: 'Versions' })
    expect(screen.getByRole('button', { name: 'Publish version 2' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Roll back version 1' })).toBeTruthy()
  })
})

describe('Agent: pause', () => {
  test('pauses after a confirmation that says what stops', async () => {
    const portal = visit(
      'owner',
      route(
        'PUT',
        PAUSE,
        json(200, { paused: true, updatedAt: NOW, updatedByMembershipId: MEMBER })
      ),
      ...all
    )
    await screen.findByText('Running')
    await portal.user.click(screen.getByRole('button', { name: 'Pause all Agents' }))
    expect(screen.getByText(/place or answer anything until you resume/)).toBeTruthy()
    expect(portal.calls.some((call) => call.method === 'PUT')).toBe(false)
    await portal.user.click(
      screen.getAllByRole('button', { name: 'Pause all Agents' }).at(-1) as HTMLElement
    )
    await screen.findByText('All Agents are paused.')
    const put = portal.calls.find((call) => call.method === 'PUT')
    expect(put?.body).toEqual({ paused: true })
    expect(put?.headers.get('idempotency-key')).toBeTruthy()
  })

  test('resumes a paused Organization without a confirmation', async () => {
    const portal = visit(
      'admin',
      route(
        'GET',
        PAUSE,
        json(200, { paused: true, updatedAt: NOW, updatedByMembershipId: MEMBER })
      ),
      route(
        'PUT',
        PAUSE,
        json(200, { paused: false, updatedAt: NOW, updatedByMembershipId: MEMBER })
      ),
      published,
      versions,
      controls
    )
    await screen.findByText('Paused')
    await portal.user.click(screen.getByRole('button', { name: 'Resume all Agents' }))
    await screen.findByText('The Agents are running again.')
    expect(portal.calls.find((call) => call.method === 'PUT')?.body).toEqual({ paused: false })
  })
})

describe('Agent: control levels', () => {
  test('lists the default and each channel, saying which follow the default', async () => {
    visit('manager', ...all)
    const rows = within(await screen.findByRole('list', { name: 'Control levels' })).getAllByRole(
      'listitem'
    )
    expect(rows).toHaveLength(6)
    expect(rows[0]?.textContent).toContain('Assisted')
    expect(rows[0]?.textContent).toContain('Mon, Tue 09:00–17:00')
    expect(rows[1]?.textContent).toContain('follows the default')
    expect(rows.find((row) => row.textContent?.startsWith('Email'))?.textContent).toContain(
      'Autonomous'
    )
  })

  test('changes a level with plain words and saves it with a key', async () => {
    const portal = visit(
      'owner',
      route('PUT', `${CONTROLS}/inbound/email`, json(200, control('email', 'supervised'))),
      ...all
    )
    await screen.findByRole('list', { name: 'Control levels' })
    await portal.user.click(screen.getByRole('button', { name: 'Edit Email' }))
    expect(
      screen.getByText(/A plain answer to a Prospect’s question is sent on its own/)
    ).toBeTruthy()
    await portal.user.click(screen.getByRole('radio', { name: /Supervised/ }))
    await portal.user.click(screen.getByRole('button', { name: 'Save Email' }))
    await screen.findByText('Email saved.')
    expect(screen.queryByRole('button', { name: 'Save Email' })).toBeNull()
    const put = portal.calls.find((call) => call.method === 'PUT')
    expect(put?.body).toMatchObject({
      level: 'supervised',
      sendWindow: { timeZone: 'Europe/London' },
      escalationRules: [{ trigger: 'pricing_question', action: 'hand_over' }],
    })
    expect(put?.headers.get('idempotency-key')).toBeTruthy()
  })

  test('a day left unticked is left out of the window', async () => {
    const portal = visit(
      'admin',
      route('PUT', `${CONTROLS}/inbound/default`, json(200, control(null, 'assisted'))),
      ...all
    )
    await screen.findByRole('list', { name: 'Control levels' })
    await portal.user.click(screen.getByRole('button', { name: 'Edit Default' }))
    await portal.user.click(screen.getByRole('checkbox', { name: 'Tuesday' }))
    await portal.user.click(screen.getByRole('button', { name: 'Save Default' }))
    await screen.findByText('Default saved.')
    const body = portal.calls.find((call) => call.method === 'PUT')?.body as {
      sendWindow: { days: { day: string }[] }
    }
    expect(body.sendWindow.days.map((item) => item.day)).toEqual(['mon'])
  })

  test('hours outside the fixed calling window are refused before anything is sent', async () => {
    const portal = visit('owner', ...all)
    await screen.findByRole('list', { name: 'Control levels' })
    await portal.user.click(screen.getByRole('button', { name: 'Edit Default' }))
    const until = screen.getByLabelText('Monday until')
    await portal.user.clear(until)
    await portal.user.type(until, '22:00')
    await portal.user.click(screen.getByRole('button', { name: 'Save Default' }))
    expect((await screen.findAllByText(/between 08:00 and 21:00/)).length).toBeGreaterThan(0)
    expect(portal.calls.some((call) => call.method === 'PUT')).toBe(false)
  })

  test('words a refusal by its code', async () => {
    const portal = visit(
      'owner',
      route('PUT', `${CONTROLS}/inbound/default`, failure(422, 'agent.settings_invalid')),
      ...all
    )
    await screen.findByRole('list', { name: 'Control levels' })
    await portal.user.click(screen.getByRole('button', { name: 'Edit Default' }))
    await portal.user.click(screen.getByRole('button', { name: 'Save Default' }))
    expect(await screen.findByText(/Those settings are not allowed/)).toBeTruthy()
  })

  test('a channel with no setting offers one that starts from the default', async () => {
    const portal = visit('owner', ...all)
    await screen.findByRole('list', { name: 'Control levels' })
    await portal.user.click(screen.getByRole('button', { name: 'Set Text message' }))
    expect((screen.getByRole('radio', { name: /Assisted/ }) as HTMLInputElement).checked).toBe(true)
  })

  test('switching the Agent loads the other kind', async () => {
    const portal = visit('owner', ...all)
    await screen.findByRole('list', { name: 'Control levels' })
    await portal.user.click(screen.getByRole('combobox', { name: 'Agent' }))
    await portal.user.click(await screen.findByRole('option', { name: 'Outbound Agent' }))
    await waitFor(() =>
      expect(
        portal.calls.some((call) => call.path === '/v1/agent-instructions/outbound/published')
      ).toBe(true)
    )
  })
})

describe('Agent: accessibility', () => {
  test.each(['light', 'dark'] as const)('passes axe in %s with a form open', async (theme) => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    }
    const portal = visit('owner', ...all)
    await screen.findByRole('list', { name: 'Control levels' })
    await portal.user.click(screen.getByRole('button', { name: 'Edit Default' }))
    const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
    expect(result.violations.map((violation) => violation.id)).toEqual([])
  })
})
