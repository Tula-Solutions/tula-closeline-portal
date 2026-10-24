import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { ERRORS } from 'tula-closeline-contract'
import { hexId, page, queueItemBody } from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'
import { choose } from '~/testing/select'

const APPROVALS = '/v1/approvals'

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', url: string, ...handlers: Handler[]) {
  return renderPortal({
    url,
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers,
  })
}

afterEach(() => {
  document.documentElement.classList.remove('dark')
  cleanup()
})

describe('Approval queue', () => {
  test('lists waiting Drafts oldest first, each linking to its panel, and marks an ungrounded one in words', async () => {
    visit(
      'rep',
      '/inbox/approvals',
      route(
        'GET',
        APPROVALS,
        json(
          200,
          page([
            queueItemBody(1, { draft: { body: 'First reply' } }),
            queueItemBody(2, {
              draft: { body: 'Second reply', ungrounded: true, sources: [], hold: 'ungrounded' },
            }),
          ])
        )
      )
    )
    const table = await screen.findByRole('table', { name: 'Drafts waiting for approval' })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(3)
    const link = within(rows[1] as HTMLElement).getByRole('link', { name: /First reply/ })
    expect(link.getAttribute('href')).toBe(`/inbox/approvals/${hexId('drf', 1)}`)
    expect(within(rows[1] as HTMLElement).queryByText('No Playbook source')).toBeNull()
    expect(within(rows[2] as HTMLElement).getByText('No Playbook source')).toBeTruthy()
  })

  test('shows Draft text as text, never as markup', async () => {
    visit(
      'rep',
      '/inbox/approvals',
      route(
        'GET',
        APPROVALS,
        json(200, page([queueItemBody(1, { draft: { body: '<img src=x onerror=alert(1)>' } })]))
      )
    )
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeTruthy()
    expect(document.querySelector('img[src="x"]')).toBeNull()
  })

  test('narrows by channel through the request', async () => {
    const portal = visit(
      'rep',
      '/inbox/approvals',
      route('GET', APPROVALS, json(200, page([queueItemBody(1)])))
    )
    await screen.findByRole('table', { name: 'Drafts waiting for approval' })
    await choose(portal.user, screen.getByLabelText('Channel'), 'linkedin')
    await waitFor(() =>
      expect(
        portal.calls.some(
          (call) =>
            call.path === APPROVALS &&
            new URL(call.url, 'http://x').searchParams.get('channel') === 'linkedin'
        )
      ).toBe(true)
    )
  })

  test('says plainly when nothing waits', async () => {
    visit('rep', '/inbox/approvals', route('GET', APPROVALS, json(200, page([]))))
    expect(await screen.findByText('No Draft is waiting for approval.')).toBeTruthy()
  })

  test('shows an error with a retry when the list fails', async () => {
    const portal = visit(
      'rep',
      '/inbox/approvals',
      route('GET', APPROVALS, failure(503, ERRORS['server.unavailable'].code))
    )
    expect((await screen.findByRole('alert')).textContent).toContain('busy')
    expect(screen.getByRole('button', { name: /try again|retry/i })).toBeTruthy()
    expect(portal.calls.length).toBeGreaterThan(0)
  })

  test('has no accessibility violations', async () => {
    visit('rep', '/inbox/approvals', route('GET', APPROVALS, json(200, page([queueItemBody(1)]))))
    await screen.findByRole('table', { name: 'Drafts waiting for approval' })
    const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
    expect(result.violations).toEqual([])
  })
})
