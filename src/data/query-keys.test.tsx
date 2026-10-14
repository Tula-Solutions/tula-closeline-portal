import { describe, expect, test } from 'bun:test'
import { screen } from '@testing-library/react'
import {
  dealBody,
  documentBody,
  importBody,
  memberBody,
  page,
  rightsBody,
  teamBody,
} from '~/testing/core-bodies'
import { json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

/** Keys that hold public data, the same for everyone; every other key must name an Organization. */
const PUBLIC_KEYS = [['password-policy']]

function cachedKeys(portal: ReturnType<typeof renderPortal>) {
  return portal.app.queryClient
    .getQueryCache()
    .getAll()
    .map((query) => query.queryKey)
}

describe('what the query cache holds', () => {
  test.each([
    ['/members', 'Maya Chen'],
    ['/teams', 'Northern'],
    ['/invitations', 'Invitations'],
    ['/playbook', 'Document 1.pdf'],
    ['/sales-history/deals', 'D-1'],
    ['/sales-history/imports', 'Completed'],
    ['/sales-history/rights', /Rights confirmed/],
  ])('%s: every cached query is Organization-keyed', async (url, text) => {
    const portal = renderPortal({
      url,
      signedIn: tokens({ organization: { id: 'org_1', role: 'owner' } }),
      handlers: [
        route('GET', '/v1/members', json(200, page([memberBody(1, { name: 'Maya Chen' })]))),
        route('GET', '/v1/teams', json(200, page([teamBody(1, 'Northern')]))),
        route('GET', '/v1/invitations', json(200, page([]))),
        route('GET', '/v1/playbook/documents', json(200, page([documentBody(1)]))),
        route('GET', '/v1/playbook/deals', json(200, page([dealBody(1)]))),
        route('GET', '/v1/playbook/deal-imports', json(200, page([importBody(1)]))),
        route('GET', '/v1/playbook/rights-confirmation', json(200, rightsBody())),
      ],
    })
    await screen.findAllByText(text)
    const keys = cachedKeys(portal)
    expect(keys.length).toBeGreaterThan(1)
    for (const key of keys) {
      expect(key.includes('org_1')).toBe(true)
    }
  })

  test('the only query a signed-out visitor makes is the public password policy', async () => {
    const portal = renderPortal({ url: '/sign-up' })
    await screen.findByLabelText(/email/i)
    const keys = cachedKeys(portal)
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) {
      expect(PUBLIC_KEYS.map((known) => known.join('/'))).toContain(key.join('/'))
    }
  })
})
