import { describe, expect, test } from 'bun:test'
import { screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { BOOKING_ERRORS } from 'tula-closeline-contract'
import { bookingTypeBody, hexId, page } from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'
import { choose } from '~/testing/select'

const TYPES = '/v1/booking-types'
const one = (n: number) => `${TYPES}/${hexId('bkt', n)}`

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', url: string, ...handlers: Handler[]) {
  return renderPortal({
    url,
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers,
  })
}

const list = route(
  'GET',
  TYPES,
  json(
    200,
    page([bookingTypeBody(1, { name: 'Discovery call' }), bookingTypeBody(2, { state: 'retired' })])
  )
)

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
}

describe('Booking Types: who may see them', () => {
  test.each(['manager', 'rep'] as const)(
    'a %s sees a notice, no Booking Types, and nothing is requested',
    async (role) => {
      const portal = visit(role, '/booking-types', list)
      expect(
        await screen.findByText(/Only an Owner or Admin can manage Booking Types/)
      ).toBeTruthy()
      expect(screen.queryByRole('list', { name: 'Booking Types' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Add Booking Type' })).toBeNull()
      expect(portal.calls.some((call) => call.path.startsWith(TYPES))).toBe(false)
    }
  )

  test.each(['manager', 'rep'] as const)('the nav link is hidden from a %s', async (role) => {
    visit(role, '/teams', route('GET', '/v1/teams', json(200, page([]))))
    await screen.findByRole('heading', { name: 'Teams' })
    expect(screen.queryByRole('link', { name: 'Booking Types' })).toBeNull()
  })

  test.each(['owner', 'admin'] as const)('the nav link is shown to an %s', async (role) => {
    visit(role, '/teams', route('GET', '/v1/teams', json(200, page([]))))
    await screen.findByRole('heading', { name: 'Teams' })
    expect(screen.getByRole('link', { name: 'Booking Types' })).toBeTruthy()
  })
})

describe('Booking Types: the list', () => {
  test('lists them with state and shape, a page at a time', async () => {
    const portal = visit(
      'admin',
      '/booking-types',
      route('GET', TYPES, (call) =>
        new URL(call.url, 'http://x').searchParams.get('cursor') === 'c2'
          ? json(200, page([bookingTypeBody(3, { name: 'Third' })]))
          : json(200, page([bookingTypeBody(1, { name: 'Discovery call' })], 'c2'))
      )
    )
    const items = await screen.findByRole('list', { name: 'Booking Types' })
    expect(within(items).getByText('Discovery call')).toBeTruthy()
    expect(
      within(items).getByText(/30 min long, 5 min before, 10 min after, 60 min notice/)
    ).toBeTruthy()
    await portal.user.click(screen.getByRole('button', { name: 'Load more Booking Types' }))
    await screen.findByText('Third')
    expect(portal.calls.filter((call) => call.path === TYPES)[0]?.url).toBe(`${TYPES}?limit=25`)
    expect(portal.calls.filter((call) => call.path === TYPES)[1]?.url).toContain('cursor=c2')
  })

  test('says when there are none', async () => {
    visit('owner', '/booking-types', route('GET', TYPES, json(200, page([]))))
    expect(await screen.findByText('There are no Booking Types yet.')).toBeTruthy()
  })

  test('a retired one has no way to change it or copy its link', async () => {
    visit('owner', '/booking-types', list)
    const item = (await screen.findByText('Discovery 2')).closest('li') as HTMLElement
    expect(within(item).getByText(/Retired/)).toBeTruthy()
    expect(within(item).queryByRole('button')).toBeNull()
  })

  test('a name with markup is shown as isolated text', async () => {
    visit(
      'admin',
      '/booking-types',
      route('GET', TYPES, json(200, page([bookingTypeBody(1, { name: '<script>x</script>' })])))
    )
    const name = await screen.findByText('<script>x</script>')
    expect(document.querySelector('main script')).toBeNull()
    expect(name.tagName).toBe('BDI')
  })
})

describe('Booking Types: add', () => {
  test('adds one, announces it, refetches and empties the form', async () => {
    const portal = visit(
      'admin',
      '/booking-types',
      route('POST', TYPES, json(201, bookingTypeBody(9))),
      list
    )
    await portal.user.type(await screen.findByLabelText('Name'), 'Demo')
    await choose(portal.user, screen.getByLabelText('Mode'), 'phone')
    const length = screen.getByLabelText('Length (minutes)')
    await portal.user.clear(length)
    await portal.user.type(length, '45')
    await portal.user.click(screen.getByRole('button', { name: 'Add Booking Type' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Booking Type added.'))
    expect(portal.calls.find((call) => call.method === 'POST')?.body).toEqual({
      name: 'Demo',
      lengthMinutes: 45,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      minimumNoticeMinutes: 60,
      mode: 'phone',
    })
    expect(
      portal.calls.filter((call) => call.method === 'GET' && call.path === TYPES).length
    ).toBeGreaterThan(1)
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('')
  })

  test('a retry after a dropped response reuses the key; a changed body gets a new one', async () => {
    let posts = 0
    const portal = visit(
      'admin',
      '/booking-types',
      route('POST', TYPES, () => {
        posts += 1
        if (posts <= 2) {
          throw new TypeError('network down')
        }
        return json(201, bookingTypeBody(9))
      }),
      list
    )
    const name = await screen.findByLabelText('Name')
    await portal.user.type(name, 'Demo')
    await portal.user.click(screen.getByRole('button', { name: 'Add Booking Type' }))
    await screen.findByRole('alert')
    await portal.user.click(screen.getByRole('button', { name: 'Add Booking Type' }))
    await waitFor(() => expect(posts).toBe(2))
    await screen.findByRole('alert')
    await portal.user.type(name, ' two')
    await portal.user.click(screen.getByRole('button', { name: 'Add Booking Type' }))
    await waitFor(() => expect(posts).toBe(3))
    const keys = portal.calls
      .filter((call) => call.method === 'POST')
      .map((call) => call.headers.get('idempotency-key'))
    expect(keys[0]).toBeTruthy()
    expect(keys[1]).toBe(keys[0])
    expect(keys[2]).toBeTruthy()
    expect(keys[2]).not.toBe(keys[0])
  })

  test('field errors come from the contract schema and nothing is sent', async () => {
    const portal = visit('admin', '/booking-types', list)
    const length = await screen.findByLabelText('Length (minutes)')
    await portal.user.clear(length)
    await portal.user.type(length, '2')
    const notice = screen.getByLabelText('Minimum notice (minutes)')
    await portal.user.clear(notice)
    await portal.user.type(notice, 'soon')
    await portal.user.click(screen.getByRole('button', { name: 'Add Booking Type' }))
    expect(await screen.findByText(/Enter a name/)).toBeTruthy()
    expect(screen.getByText(/length as a whole number of minutes, from 5 to 480/)).toBeTruthy()
    expect(screen.getByText(/minimum notice as whole minutes/)).toBeTruthy()
    expect(length.getAttribute('aria-invalid')).toBe('true')
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
  })

  test('a refusal is worded by its code, never by the status or the service text', async () => {
    const portal = visit(
      'admin',
      '/booking-types',
      route('POST', TYPES, failure(422, BOOKING_ERRORS['booking.type_invalid'].code)),
      list
    )
    await portal.user.type(await screen.findByLabelText('Name'), 'Demo')
    await portal.user.click(screen.getByRole('button', { name: 'Add Booking Type' }))
    const alert = await screen.findByText(/Core did not accept those numbers/)
    expect(alert.textContent).not.toContain('Text the portal never shows')
  })
})

describe('Booking Types: edit', () => {
  test('changes one and refetches', async () => {
    const portal = visit(
      'owner',
      '/booking-types',
      route('PATCH', one(1), json(200, bookingTypeBody(1, { name: 'Renamed' }))),
      list
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Edit Discovery call' }))
    const form = screen.getByRole('form', { name: 'Edit Discovery call' })
    const name = within(form).getByLabelText('Name')
    await portal.user.clear(name)
    await portal.user.type(name, 'Renamed')
    await portal.user.click(within(form).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Booking Type saved.'))
    expect(portal.calls.find((call) => call.method === 'PATCH')?.body).toMatchObject({
      name: 'Renamed',
      lengthMinutes: 30,
      mode: 'video',
    })
    expect(screen.queryByRole('form', { name: 'Edit Discovery call' })).toBeNull()
  })

  test('a Booking Type gone since the list shows the not-found words', async () => {
    const portal = visit(
      'owner',
      '/booking-types',
      route('PATCH', one(1), failure(404, BOOKING_ERRORS['booking.type_not_found'].code)),
      list
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Edit Discovery call' }))
    await portal.user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText(/That Booking Type no longer exists/)).toBeTruthy()
  })
})

describe('Booking Types: retire', () => {
  test('retires after a confirmation, and refetches', async () => {
    const portal = visit(
      'admin',
      '/booking-types',
      route('POST', `${one(1)}/retire`, json(200, bookingTypeBody(1, { state: 'retired' }))),
      list
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Retire Discovery call' }))
    expect(portal.calls.some((call) => call.path.endsWith('/retire'))).toBe(false)
    await portal.user.click(screen.getByRole('button', { name: 'Retire Booking Type' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Booking Type retired.')
    )
    expect(
      portal.calls.filter((call) => call.method === 'GET' && call.path === TYPES).length
    ).toBeGreaterThan(1)
  })
})

describe('Booking Types: copy link', () => {
  test('copies the link built from the token core gave, and says so', async () => {
    const written: string[] = []
    const portal = visit('admin', '/booking-types', list)
    stubClipboard((text) => {
      written.push(text)
      return Promise.resolve()
    })
    await portal.user.click(
      await screen.findByRole('button', { name: 'Copy link for Discovery call' })
    )
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Link copied.'))
    expect(written).toEqual([`${window.location.origin}/book/${bookingTypeBody(1).publicToken}`])
  })

  test('when copying fails it shows the link to copy by hand', async () => {
    const portal = visit('admin', '/booking-types', list)
    stubClipboard(() => Promise.reject(new Error('denied')))
    await portal.user.click(
      await screen.findByRole('button', { name: 'Copy link for Discovery call' })
    )
    expect(await screen.findByText(/Could not copy the link/)).toBeTruthy()
    expect((screen.getByLabelText('Public link') as HTMLInputElement).value).toContain('/book/')
  })

  test('no token from core means no copy button', async () => {
    visit(
      'admin',
      '/booking-types',
      route('GET', TYPES, json(200, page([bookingTypeBody(1, { publicToken: null })])))
    )
    await screen.findByText('Discovery 1')
    expect(screen.queryByRole('button', { name: /Copy link/ })).toBeNull()
  })
})

for (const theme of ['light', 'dark'] as const) {
  describe(`Booking Types: accessibility in ${theme}`, () => {
    test('has no axe violations', async () => {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
      }
      const portal = visit('admin', '/booking-types', list)
      await portal.user.click(await screen.findByRole('button', { name: 'Edit Discovery call' }))
      await screen.findByRole('form', { name: 'Edit Discovery call' })
      const result = await axe.run(document.body, {
        rules: { 'color-contrast': { enabled: false } },
      })
      expect(result.violations.map((v) => v.id)).toEqual([])
      document.documentElement.classList.remove('dark')
    })
  })
}
