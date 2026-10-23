import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { companyBody, hexId, page, prospectBody } from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'
import { chosenValue } from '~/testing/select'

const ID = hexId('prs', 1)
const ONE = `/v1/prospects/${ID}`

function visit(...handlers: Handler[]) {
  return renderPortal({
    url: `/prospects/${ID}`,
    signedIn: tokens({ organization: { id: 'org_1', role: 'rep' } }),
    handlers: [
      ...handlers,
      route('GET', '/v1/prospect-companies', json(200, page([companyBody(1, 'Acme')]))),
    ],
  })
}

const patches = (portal: ReturnType<typeof renderPortal>) =>
  portal.calls.filter((call) => call.method === 'PATCH' && call.path === ONE)

afterEach(() => {
  document.documentElement.classList.remove('dark')
  cleanup()
})

describe('Prospect: the detail', () => {
  test('each field hides its Source and time until asked, in a row, not a tooltip', async () => {
    const portal = visit(
      route(
        'GET',
        ONE,
        json(
          200,
          prospectBody(1, {
            fields: {
              email: {
                value: 'a@example.com',
                source: 'crm:hubspot',
                sourceRef: 'contact-9',
                setAt: '2026-10-02T08:30:00Z',
                setByUserId: null,
              },
            },
          })
        )
      )
    )
    const button = await screen.findByRole('button', { name: 'Source of Email address' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText(/HubSpot/)).toBeNull()
    await portal.user.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    const row = document.getElementById(button.getAttribute('aria-controls') ?? '')
    expect(row?.textContent).toContain('HubSpot')
    expect(row?.textContent).toContain('contact-9')
    expect(row?.querySelector('time')).not.toBeNull()
    await portal.user.click(button)
    expect(screen.queryByText(/HubSpot/)).toBeNull()
  })

  test('saving sends only what changed, and an emptied field is cleared with null', async () => {
    const portal = visit(
      route('GET', ONE, json(200, prospectBody(1))),
      route('PATCH', ONE, json(200, prospectBody(1)))
    )
    const email = await screen.findByLabelText('Email address')
    await portal.user.clear(email)
    await portal.user.type(screen.getByLabelText('Job title'), 'VP Sales')
    await portal.user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('Details saved.')
    expect(patches(portal)[0]?.body).toEqual({ email: null, jobTitle: 'VP Sales' })
  })

  test('saving with nothing changed asks for a change and sends nothing', async () => {
    const portal = visit(route('GET', ONE, json(200, prospectBody(1))))
    await screen.findByLabelText('Email address')
    await portal.user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Change a detail first, then save.')).toBeTruthy()
    expect(patches(portal).length).toBe(0)
  })

  test('a duplicate identity is shown on the field it names', async () => {
    const portal = visit(
      route('GET', ONE, json(200, prospectBody(1))),
      route('PATCH', ONE, failure(409, 'prospect.duplicate_identity', { identityKind: 'email' }))
    )
    const email = await screen.findByLabelText('Email address')
    await portal.user.type(email, 'x')
    await portal.user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(email.getAttribute('aria-invalid')).toBe('true'))
    expect(
      document.getElementById(email.getAttribute('aria-describedby') ?? '')?.textContent
    ).toContain('already has this email address')
  })

  test('notes and tags are saved together', async () => {
    const portal = visit(
      route('GET', ONE, json(200, prospectBody(1))),
      route('PATCH', ONE, json(200, prospectBody(1, { tags: ['vip', 'q4'], notes: 'Call Monday' })))
    )
    await portal.user.type(await screen.findByLabelText('Tags'), 'vip, q4')
    await portal.user.type(screen.getByLabelText('Notes'), 'Call Monday')
    await portal.user.click(screen.getByRole('button', { name: 'Save notes and tags' }))
    await screen.findByText('Notes and tags saved.')
    expect(patches(portal)[0]?.body).toEqual({ tags: ['vip', 'q4'], notes: 'Call Monday' })
  })

  test('saving notes keeps unsaved edits in the details form', async () => {
    const saved = {
      ...prospectBody(1, { notes: 'Call Monday' }),
      updatedAt: '2026-10-24T10:00:00.000Z',
    }
    let patched = false
    const portal = visit(
      route('GET', ONE, () => json(200, patched ? saved : prospectBody(1))),
      route('PATCH', ONE, () => {
        patched = true
        return json(200, saved)
      })
    )
    await portal.user.type(await screen.findByLabelText('Job title'), 'VP Sales')
    await portal.user.type(screen.getByLabelText('Notes'), 'Call Monday')
    await portal.user.click(screen.getByRole('button', { name: 'Save notes and tags' }))
    await screen.findByText('Notes and tags saved.')
    expect((screen.getByLabelText('Job title') as HTMLInputElement).value).toBe('VP Sales')
  })

  test('the subtitle reads as a sentence with the source in lower case', async () => {
    visit(route('GET', ONE, json(200, prospectBody(1))))
    expect(
      await screen.findByText(/^Active\. Added through manual entry on \d{1,2} \w+ 20\d\d\.$/)
    ).toBeTruthy()
  })

  test('a Prospect that is gone is explained by its code', async () => {
    visit(route('GET', ONE, failure(404, 'prospect.not_found')))
    expect(await screen.findByText(/no longer exists, or you cannot see it/)).toBeTruthy()
  })

  test('passes axe in light and dark with a Source open', async () => {
    const portal = visit(route('GET', ONE, json(200, prospectBody(1))))
    await portal.user.click(await screen.findByRole('button', { name: 'Source of Email address' }))
    const run = async () =>
      (
        await axe.run(screen.getByRole('main'), { rules: { 'color-contrast': { enabled: false } } })
      ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
    expect(await run()).toEqual([])
    document.documentElement.classList.add('dark')
    expect(await run()).toEqual([])
  })
})

describe('Prospect: a Company outside the first page', () => {
  const far = hexId('pco', 250)

  test('the detail names the Company and the edit choice keeps it selected', async () => {
    visit(
      route('GET', `/v1/prospect-companies/${far}`, json(200, companyBody(250, 'Zenith Works'))),
      route('GET', ONE, json(200, prospectBody(1, { companyId: far })))
    )
    expect(await screen.findByText('Zenith Works', { selector: 'dd *, dd' })).toBeTruthy()
    const select = await screen.findByLabelText('Prospect Company')
    await waitFor(() => expect(chosenValue(select)).toBe(far))
  })
})
