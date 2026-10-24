import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { policyBody } from '~/testing/core-bodies'
import { type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const POLICIES = '/v1/approval-policies'

const ALL = json(200, {
  items: [
    policyBody('email', { mode: 'below_confidence', threshold: 0.8 }),
    policyBody('linkedin'),
    policyBody('chat', { mode: 'except', labels: ['question'] }),
  ],
})

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', ...handlers: Handler[]) {
  return renderPortal({
    url: '/inbox/policy',
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers,
  })
}

afterEach(() => {
  document.documentElement.classList.remove('dark')
  cleanup()
})

describe('Approval policy', () => {
  test('a Rep is told it is for Owners and Admins, and no request is made', async () => {
    const portal = visit('rep', route('GET', POLICIES, ALL))
    expect(await screen.findByText(/Only an Owner or Admin/)).toBeTruthy()
    expect(portal.calls.some((call) => call.path.startsWith(POLICIES))).toBe(false)
  })

  test('an Admin sees one section per channel with the current rule', async () => {
    visit('admin', route('GET', POLICIES, ALL))
    const email = await screen.findByRole('group', { name: 'Email' })
    expect(
      (within(email).getByLabelText('Only when confidence is below') as HTMLInputElement).checked
    ).toBe(true)
    expect((within(email).getByLabelText('Confidence threshold') as HTMLInputElement).value).toBe(
      '0.8'
    )
    const chat = screen.getByRole('group', { name: 'Chat' })
    expect((within(chat).getByLabelText('Question') as HTMLInputElement).checked).toBe(true)
  })

  test('says which Drafts are always held, and offers no control for them', async () => {
    visit('owner', route('GET', POLICIES, ALL))
    await screen.findByRole('group', { name: 'Email' })
    const fixed = screen.getByRole('region', { name: 'Always held for a person' })
    for (const text of [
      /cite no Playbook source/i,
      /check fails/i,
      /need a person/i,
      /first message/i,
    ]) {
      expect(within(fixed).getByText(text)).toBeTruthy()
    }
    expect(screen.queryByLabelText(/ungrounded/i)).toBeNull()
  })

  test('saves one channel with a PUT of its rule', async () => {
    const portal = visit(
      'admin',
      route('GET', POLICIES, ALL),
      route('PUT', `${POLICIES}/linkedin`, (call) =>
        json(200, policyBody('linkedin', (call.body as { rule: unknown }).rule))
      )
    )
    const group = await screen.findByRole('group', { name: 'LinkedIn' })
    await portal.user.click(within(group).getByLabelText('Only when confidence is below'))
    const threshold = within(group).getByLabelText('Confidence threshold')
    await portal.user.clear(threshold)
    await portal.user.type(threshold, '0.9')
    await portal.user.click(within(group).getByRole('button', { name: 'Save LinkedIn' }))
    await waitFor(() => {
      const put = portal.calls.find((call) => call.method === 'PUT')
      expect(put?.path).toBe(`${POLICIES}/linkedin`)
      expect(put?.body).toEqual({ rule: { mode: 'below_confidence', threshold: 0.9 } })
    })
    expect(await screen.findByText('LinkedIn saved.')).toBeTruthy()
  })

  test('refuses a threshold outside 0 to 1 without asking core', async () => {
    const portal = visit('admin', route('GET', POLICIES, ALL))
    const group = await screen.findByRole('group', { name: 'Email' })
    const threshold = within(group).getByLabelText('Confidence threshold')
    await portal.user.clear(threshold)
    await portal.user.type(threshold, '3')
    await portal.user.click(within(group).getByRole('button', { name: 'Save Email' }))
    expect(await within(group).findByText(/between 0 and 1/)).toBeTruthy()
    expect(portal.calls.some((call) => call.method === 'PUT')).toBe(false)
  })

  test('has no accessibility violations', async () => {
    visit('admin', route('GET', POLICIES, ALL))
    await screen.findByRole('group', { name: 'Email' })
    const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
    expect(result.violations).toEqual([])
  })
})
