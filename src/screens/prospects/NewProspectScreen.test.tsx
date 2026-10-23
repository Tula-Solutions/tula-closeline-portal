import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { companyBody, hexId, memberBody, page, prospectBody } from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const PROSPECTS = '/v1/prospects'

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', ...handlers: Handler[]) {
  return renderPortal({
    url: '/prospects/new',
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers: [
      ...handlers,
      route('GET', '/v1/prospect-companies', json(200, page([companyBody(1, 'Acme')]))),
      route(
        'GET',
        '/v1/members',
        json(200, page([memberBody(1, { name: 'Maya Chen', role: 'rep' })]))
      ),
    ],
  })
}

const posts = (portal: ReturnType<typeof renderPortal>) =>
  portal.calls.filter((call) => call.method === 'POST' && call.path === PROSPECTS)

afterEach(() => {
  document.documentElement.classList.remove('dark')
  cleanup()
})

describe('Add a Prospect', () => {
  test('creates with an idempotency key and opens the new Prospect', async () => {
    const portal = visit(
      'rep',
      route('POST', PROSPECTS, json(201, prospectBody(4))),
      route('GET', `${PROSPECTS}/${hexId('prs', 4)}`, json(200, prospectBody(4)))
    )
    await portal.user.type(await screen.findByLabelText('First name'), 'Ann')
    await portal.user.type(screen.getByLabelText('Email address'), 'ann@example.com')
    await portal.user.click(screen.getByRole('button', { name: 'Add Prospect' }))
    await waitFor(() =>
      expect(portal.router.state.location.pathname).toBe(`/prospects/${hexId('prs', 4)}`)
    )
    const call = posts(portal)[0]
    expect(call?.body).toEqual({ firstName: 'Ann', email: 'ann@example.com' })
    expect(call?.headers.get('idempotency-key')).toBeTruthy()
  })

  test('needs a name, an email address, a phone number or a LinkedIn address', async () => {
    const portal = visit('rep')
    await portal.user.click(await screen.findByRole('button', { name: 'Add Prospect' }))
    expect(
      await screen.findByText(
        'Enter a name, an email address, a phone number or a LinkedIn address.'
      )
    ).toBeTruthy()
    expect(posts(portal).length).toBe(0)
  })

  test('a duplicate is shown on the field it names', async () => {
    const portal = visit(
      'rep',
      route(
        'POST',
        PROSPECTS,
        failure(409, 'prospect.duplicate_identity', { identityKind: 'phone' })
      )
    )
    const phone = await screen.findByLabelText('Phone number')
    await portal.user.type(phone, '+14155550123')
    await portal.user.click(screen.getByRole('button', { name: 'Add Prospect' }))
    await waitFor(() => expect(phone.getAttribute('aria-invalid')).toBe('true'))
  })

  test('a Rep is not asked for an owner; an Admin may name one', async () => {
    visit('rep')
    await screen.findByLabelText('First name')
    expect(screen.queryByLabelText('Owner')).toBeNull()
    cleanup()
    const portal = visit('admin', route('POST', PROSPECTS, json(201, prospectBody(5))))
    await portal.user.type(await screen.findByLabelText('First name'), 'Bo')
    await portal.user.selectOptions(await screen.findByLabelText('Owner'), hexId('mem', 1))
    await portal.user.click(screen.getByRole('button', { name: 'Add Prospect' }))
    await waitFor(() => expect(posts(portal).length).toBe(1))
    expect(posts(portal)[0]?.body).toEqual({ firstName: 'Bo', ownerMembershipId: hexId('mem', 1) })
  })

  test('passes axe in light and dark', async () => {
    visit('rep')
    await screen.findByLabelText('First name')
    const run = async () =>
      (
        await axe.run(screen.getByRole('main'), { rules: { 'color-contrast': { enabled: false } } })
      ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
    expect(await run()).toEqual([])
    document.documentElement.classList.add('dark')
    expect(await run()).toEqual([])
  })
})

describe('Add a Prospect: pickers that reach past the first page', () => {
  test('the Prospect Company picker searches Companies by name on the server', async () => {
    const portal = visit(
      'rep',
      route('GET', '/v1/prospect-companies', (call) =>
        new URL(call.url, 'http://x').searchParams.get('q') === 'zen'
          ? json(200, page([companyBody(250, 'Zenith Works')]))
          : json(200, page([companyBody(1, 'Acme')]))
      ),
      route('POST', PROSPECTS, json(201, prospectBody(6)))
    )
    await portal.user.type(await screen.findByLabelText('Search Prospect Companies'), 'zen')
    const option = await screen.findByRole('option', { name: 'Zenith Works' }, { timeout: 3000 })
    await portal.user.selectOptions(screen.getByLabelText('Prospect Company'), option)
    await portal.user.type(screen.getByLabelText('First name'), 'Bo')
    await portal.user.click(screen.getByRole('button', { name: 'Add Prospect' }))
    await waitFor(() => expect(posts(portal).length).toBe(1))
    expect(posts(portal)[0]?.body).toEqual({ firstName: 'Bo', companyId: hexId('pco', 250) })
  })

  test('the Owner choice lists members from every page', async () => {
    visit(
      'admin',
      route('GET', '/v1/members', (call) =>
        new URL(call.url, 'http://x').searchParams.get('cursor') === 'm2'
          ? json(200, page([memberBody(150, { name: 'Zed Late', role: 'rep' })]))
          : json(200, page([memberBody(1, { name: 'Maya Chen', role: 'rep' })], 'm2'))
      )
    )
    await screen.findByLabelText('Owner')
    await waitFor(() => expect(screen.getByRole('option', { name: 'Zed Late' })).toBeTruthy())
  })
})
