import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { ERRORS } from 'tula-closeline-contract'
import { escalationRuleBody, page } from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const RULES = '/v1/escalation-rules'

const ALL = json(200, {
  items: [
    escalationRuleBody({ trigger: 'asks_for_person', target: 'prospect_owner' }),
    escalationRuleBody({ trigger: 'low_confidence', target: 'admin_queue', threshold: 0.4 }),
  ],
  nextCursor: null,
})

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', ...handlers: Handler[]) {
  return renderPortal({
    url: '/inbox/escalation',
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers: [...handlers, route('GET', '/v1/teams', json(200, page([])))],
  })
}

afterEach(() => {
  document.documentElement.classList.remove('dark')
  cleanup()
})

describe('Escalation rules', () => {
  test('a Rep is told it is for Owners and Admins, and no request is made', async () => {
    const portal = visit('rep', route('GET', RULES, ALL))
    expect(await screen.findByText(/Only an Owner or Admin/)).toBeTruthy()
    expect(portal.calls.some((call) => call.path.startsWith(RULES))).toBe(false)
  })

  test('shows one section per trigger with the current rule', async () => {
    visit('admin', route('GET', RULES, ALL))
    const asks = await screen.findByRole('group', { name: 'The Prospect asks for a person' })
    expect((within(asks).getByLabelText('The Prospect’s owner') as HTMLInputElement).checked).toBe(
      true
    )
    const low = screen.getByRole('group', { name: 'The Agent is not confident' })
    expect((within(low).getByLabelText('Confidence threshold') as HTMLInputElement).value).toBe(
      '0.4'
    )
    expect(within(low).getByRole('button', { name: 'Remove rule' })).toBeTruthy()
    const none = screen.getByRole('group', { name: 'The reply turns to pricing or legal terms' })
    expect(within(none).queryByRole('button', { name: 'Remove rule' })).toBeNull()
  })

  test('saves a trigger with a PUT of its target and threshold', async () => {
    const portal = visit(
      'owner',
      route('GET', RULES, ALL),
      route('PUT', `${RULES}/low_confidence`, (call) =>
        json(200, escalationRuleBody({ trigger: 'low_confidence', ...(call.body as object) }))
      )
    )
    const group = await screen.findByRole('group', { name: 'The Agent is not confident' })
    const threshold = within(group).getByLabelText('Confidence threshold')
    await portal.user.clear(threshold)
    await portal.user.type(threshold, '0.6')
    await portal.user.click(within(group).getByRole('button', { name: 'Save rule' }))
    await waitFor(() => {
      const put = portal.calls.find((call) => call.method === 'PUT')
      expect(put?.path).toBe(`${RULES}/low_confidence`)
      expect(put?.body).toEqual({ target: 'admin_queue', enabled: true, threshold: 0.6 })
    })
    expect(await screen.findByText('Rule saved.')).toBeTruthy()
  })

  test('a Team round-robin needs a Team, and says so without asking core', async () => {
    const portal = visit('admin', route('GET', RULES, ALL))
    const group = await screen.findByRole('group', { name: 'The Prospect asks for a person' })
    await portal.user.click(within(group).getByLabelText('A Team, in turn'))
    await portal.user.click(within(group).getByRole('button', { name: 'Save rule' }))
    expect(await within(group).findByText('Choose the Team.')).toBeTruthy()
    expect(portal.calls.some((call) => call.method === 'PUT')).toBe(false)
  })

  test('refuses a threshold outside 0 to 1 without asking core', async () => {
    const portal = visit('admin', route('GET', RULES, ALL))
    const group = await screen.findByRole('group', { name: 'The Agent is not confident' })
    const threshold = within(group).getByLabelText('Confidence threshold')
    await portal.user.clear(threshold)
    await portal.user.type(threshold, '3')
    await portal.user.click(within(group).getByRole('button', { name: 'Save rule' }))
    expect(await within(group).findByText(/above 0 and up to 1/)).toBeTruthy()
    expect(portal.calls.some((call) => call.method === 'PUT')).toBe(false)
  })

  test('removes a rule with a DELETE', async () => {
    const portal = visit(
      'admin',
      route('GET', RULES, ALL),
      route('DELETE', `${RULES}/asks_for_person`, new Response(null, { status: 204 }))
    )
    const group = await screen.findByRole('group', { name: 'The Prospect asks for a person' })
    await portal.user.click(within(group).getByRole('button', { name: 'Remove rule' }))
    await waitFor(() => {
      expect(
        portal.calls.some((c) => c.method === 'DELETE' && c.path.endsWith('asks_for_person'))
      ).toBe(true)
    })
    expect(await screen.findByText('Rule removed.')).toBeTruthy()
  })

  test('words a refusal from its code', async () => {
    const portal = visit(
      'admin',
      route('GET', RULES, ALL),
      route('PUT', `${RULES}/asks_for_person`, failure(403, ERRORS['auth.forbidden'].code))
    )
    const group = await screen.findByRole('group', { name: 'The Prospect asks for a person' })
    await portal.user.click(within(group).getByRole('button', { name: 'Save rule' }))
    const alert = await within(group).findByRole('alert')
    expect(alert.textContent).not.toContain('Text the portal never shows.')
  })

  test('has no accessibility violations', async () => {
    visit('admin', route('GET', RULES, ALL))
    await screen.findByRole('group', { name: 'The Agent is not confident' })
    const run = async () =>
      (
        await axe.run(screen.getByRole('main'), { rules: { 'color-contrast': { enabled: false } } })
      ).violations.map((v) => v.id)
    expect(await run()).toEqual([])
    document.documentElement.classList.add('dark')
    expect(await run()).toEqual([])
  })
})
