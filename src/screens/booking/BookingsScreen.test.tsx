import { describe, expect, test } from 'bun:test'
import { screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { BOOKING_ERRORS } from 'tula-closeline-contract'
import {
  bookingBody,
  bookingTypeBody,
  hexId,
  memberBody,
  page,
  prospectBody,
  slotBody,
} from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'
import { choose } from '~/testing/select'

const BOOKINGS = '/v1/bookings'
const SLOTS = '/v1/booking-slots'
const one = (n: number, action: string) => `${BOOKINGS}/${hexId('bkg', n)}/${action}`
const param = (url: string, name: string) => new URL(url, 'http://x').searchParams.get(name)

const PAST = '2020-03-02T10:00:00Z'
const PAST_END = '2020-03-02T10:30:00Z'

/** The reads every row makes: Booking Types, the Prospect and the Rep's name. */
const lookups: Handler[] = [
  route(
    'GET',
    '/v1/booking-types',
    json(200, page([bookingTypeBody(1, { name: 'Discovery call' })]))
  ),
  route('GET', `/v1/prospects/${hexId('prs', 1)}`, json(200, prospectBody(1))),
  route('GET', '/v1/members', json(200, page([memberBody(1, { name: 'Ada Rep' })]))),
]

/** Core's list: `from` asks for upcoming, `to` for past. */
function lists(upcoming: Handler | Response, past?: Response): Handler {
  return (call) => {
    if (call.method !== 'GET' || call.path !== BOOKINGS) {
      return null
    }
    if (param(call.url, 'from') !== null) {
      return typeof upcoming === 'function' ? upcoming(call) : upcoming.clone()
    }
    return (past ?? json(200, page([]))).clone()
  }
}

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', ...handlers: Handler[]) {
  return renderPortal({
    url: '/bookings',
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers: [...handlers, ...lookups],
  })
}

const SLOT_A = '2099-01-06T15:00:00Z'
const SLOT_B = '2099-01-07T15:00:00Z'
const slotsFor = (...times: [string, string?][]) =>
  json(200, page(times.map(([at, rep]) => slotBody(at, rep))))

describe('Bookings: the lists', () => {
  test('lists upcoming and past apart, each asked with its own side of now', async () => {
    const portal = visit(
      'owner',
      lists(
        json(200, page([bookingBody(1)])),
        json(200, page([bookingBody(2, { startsAt: PAST, endsAt: PAST_END })]))
      )
    )
    const upcoming = await screen.findByRole('list', { name: 'Upcoming Bookings' })
    const past = await screen.findByRole('list', { name: 'Past Bookings' })
    expect(within(upcoming).getAllByRole('listitem')).toHaveLength(1)
    expect(within(past).getAllByRole('listitem')).toHaveLength(1)
    const reads = portal.calls.filter((call) => call.path === BOOKINGS)
    expect(reads.some((call) => param(call.url, 'from') !== null)).toBe(true)
    expect(reads.some((call) => param(call.url, 'to') !== null)).toBe(true)
  })

  test('a row says when, which Booking Type, mode, state, origin, Prospect and Rep', async () => {
    visit('owner', lists(json(200, page([bookingBody(1, { origin: 'public' })]))))
    const item = (await screen.findByRole('list', { name: 'Upcoming Bookings' })).querySelector(
      'li'
    ) as HTMLElement
    expect(await within(item).findByText(/Discovery call/)).toBeTruthy()
    expect(item.textContent).toContain('Video')
    expect(item.textContent).toContain('Confirmed')
    expect(item.textContent).toContain('Booked on the public page')
    expect(await within(item).findByText('First1 Last1')).toBeTruthy()
    expect(await within(item).findByText('Ada Rep')).toBeTruthy()
    expect(item.querySelector('time')?.getAttribute('datetime')).toBe('2099-01-05T15:00:00Z')
  })

  test('Load more Bookings follows the cursor of that list only', async () => {
    const portal = visit(
      'owner',
      lists((call) =>
        param(call.url, 'cursor') === 'c2'
          ? json(
              200,
              page([
                bookingBody(3, {
                  startsAt: '2099-02-01T10:00:00Z',
                  endsAt: '2099-02-01T10:30:00Z',
                }),
              ])
            )
          : json(200, page([bookingBody(1)], 'c2'))
      )
    )
    const upcoming = await screen.findByRole('list', { name: 'Upcoming Bookings' })
    await portal.user.click(await screen.findByRole('button', { name: 'Load more Bookings' }))
    await waitFor(() => expect(within(upcoming).getAllByRole('listitem')).toHaveLength(2))
    const cursors = portal.calls
      .filter((call) => call.path === BOOKINGS && param(call.url, 'cursor') !== null)
      .map((call) => param(call.url, 'from'))
    expect(cursors).toHaveLength(1)
    expect(cursors[0]).not.toBeNull()
  })

  test('Upcoming asks soonest first, Past latest first, and shows the rows as core sent them', async () => {
    const portal = visit(
      'owner',
      lists(
        json(
          200,
          page([
            bookingBody(1, { startsAt: '2099-01-05T15:00:00Z', endsAt: '2099-01-05T15:30:00Z' }),
            bookingBody(3, { startsAt: '2099-03-05T15:00:00Z', endsAt: '2099-03-05T15:30:00Z' }),
          ])
        ),
        json(200, page([bookingBody(2, { startsAt: PAST, endsAt: PAST_END })]))
      )
    )
    const upcoming = await screen.findByRole('list', { name: 'Upcoming Bookings' })
    await waitFor(() => expect(within(upcoming).getAllByRole('listitem')).toHaveLength(2))
    const times = [...upcoming.querySelectorAll('time')].map((t) => t.getAttribute('datetime'))
    expect(times).toEqual(['2099-01-05T15:00:00Z', '2099-03-05T15:00:00Z'])
    const reads = portal.calls.filter((call) => call.path === BOOKINGS)
    expect(
      reads.filter((c) => param(c.url, 'from') !== null).map((c) => param(c.url, 'order'))
    ).toEqual(['asc'])
    expect(
      reads.filter((c) => param(c.url, 'to') !== null).map((c) => param(c.url, 'order'))
    ).toEqual(['desc'])
  })

  test('a refused cursor (request.invalid) starts the list again from page one', async () => {
    let upcomingReads = 0
    const portal = visit(
      'owner',
      lists((call) => {
        upcomingReads += 1
        if (param(call.url, 'cursor') === 'c2') {
          return failure(400, 'request.invalid')
        }
        return json(200, page([bookingBody(1)], upcomingReads === 1 ? 'c2' : null))
      })
    )
    await portal.user.click(await screen.findByRole('button', { name: 'Load more Bookings' }))
    const upcoming = await screen.findByRole('list', { name: 'Upcoming Bookings' })
    await waitFor(() => expect(upcomingReads).toBeGreaterThanOrEqual(3))
    await waitFor(() => expect(within(upcoming).getAllByRole('listitem')).toHaveLength(1))
    expect(screen.queryByRole('alert')).toBeNull()
    const last = portal.calls
      .filter((c) => c.path === BOOKINGS && param(c.url, 'from') !== null)
      .at(-1)
    expect(last && param(last.url, 'cursor')).toBeNull()
  })

  test('a page-one request.invalid is an error, not a retry loop', async () => {
    const portal = visit('owner', lists(failure(400, 'request.invalid')))
    await screen.findAllByRole('alert')
    await new Promise((done) => setTimeout(done, 300))
    const upcomingReads = portal.calls.filter(
      (c) => c.path === BOOKINGS && param(c.url, 'from') !== null
    )
    expect(upcomingReads.length).toBeLessThanOrEqual(2)
  })

  test('one Members request serves every row of the page', async () => {
    const portal = visit(
      'owner',
      lists(
        json(
          200,
          page([
            bookingBody(1, { repMembershipId: hexId('mem', 1) }),
            bookingBody(2, { repMembershipId: hexId('mem', 2) }),
            bookingBody(3, { repMembershipId: hexId('mem', 1) }),
          ])
        ),
        json(200, page([bookingBody(4, { startsAt: PAST, endsAt: PAST_END })]))
      )
    )
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Upcoming Bookings' })).getAllByRole('listitem')
      ).toHaveLength(3)
    )
    await screen.findAllByText('Ada Rep')
    const members = portal.calls.filter((c) => c.path === '/v1/members')
    expect(members).toHaveLength(1)
  })

  test('says when there are none', async () => {
    visit('owner', lists(json(200, page([]))))
    expect(await screen.findByText('There are no upcoming Bookings.')).toBeTruthy()
    expect(await screen.findByText('There are no past Bookings.')).toBeTruthy()
  })

  test('a Prospect name with markup is shown as isolated text', async () => {
    visit(
      'owner',
      lists(json(200, page([bookingBody(1)]))),
      route(
        'GET',
        `/v1/prospects/${hexId('prs', 1)}`,
        json(
          200,
          prospectBody(1, {
            fields: {
              firstName: {
                value: '<script>x</script>',
                source: 'manual',
                sourceRef: null,
                setAt: '2026-10-02T08:30:00Z',
                setByUserId: hexId('usr', 1),
              },
            },
          })
        )
      )
    )
    const name = await screen.findByText(/<script>x<\/script>/)
    expect(document.querySelector('main script')).toBeNull()
    expect(name.tagName).toBe('BDI')
  })
})

describe('Bookings: wording by role', () => {
  test.each([
    ['rep', 'Your own Bookings.'],
    ['manager', "The Bookings of your Team's Reps."],
    ['admin', 'Every Booking in the Organization, by every Rep.'],
    ['owner', 'Every Booking in the Organization, by every Rep.'],
  ] as const)('a %s is told whose Bookings these are', async (role, words) => {
    visit(role, lists(json(200, page([]))))
    expect(await screen.findByText(words)).toBeTruthy()
  })

  test('a Rep sees "You" and no member is looked up; a Manager sees the name', async () => {
    const asRep = visit('rep', lists(json(200, page([bookingBody(1)]))))
    expect(await screen.findByText(/for You/)).toBeTruthy()
    expect(asRep.calls.some((call) => call.path === '/v1/members')).toBe(false)
  })

  test('a Manager sees the name of the Rep', async () => {
    visit('manager', lists(json(200, page([bookingBody(1)]))))
    expect(await screen.findByText('Ada Rep')).toBeTruthy()
  })

  test.each(['owner', 'admin', 'manager', 'rep'] as const)(
    'the nav link is shown to a %s',
    async (role) => {
      visit(role, lists(json(200, page([]))))
      await screen.findByRole('heading', { name: 'Bookings' })
      expect(screen.getByRole('link', { name: 'Bookings' })).toBeTruthy()
    }
  )
})

describe('Bookings: cancel', () => {
  test('asks first, then cancels, announces it and reads the lists again', async () => {
    const portal = visit(
      'owner',
      lists(json(200, page([bookingBody(1)]))),
      route('POST', one(1, 'cancel'), json(200, bookingBody(1, { state: 'cancelled' })))
    )
    await portal.user.click(await screen.findByRole('button', { name: /^Cancel the Booking on/ }))
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
    await portal.user.click(screen.getByRole('button', { name: 'Cancel Booking' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Booking cancelled.'))
    expect(portal.calls.filter((call) => call.method === 'POST')).toHaveLength(1)
    expect(portal.calls.filter((call) => call.path === BOOKINGS).length).toBeGreaterThan(2)
  })

  test('a calendar that does not answer is explained and the Booking stays', async () => {
    const portal = visit(
      'owner',
      lists(json(200, page([bookingBody(1)]))),
      route(
        'POST',
        one(1, 'cancel'),
        failure(503, BOOKING_ERRORS['booking.calendar_unavailable'].code)
      )
    )
    await portal.user.click(await screen.findByRole('button', { name: /^Cancel the Booking on/ }))
    await portal.user.click(screen.getByRole('button', { name: 'Cancel Booking' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain("Rep's calendar did not answer")
    expect(alert.textContent).not.toContain('Text the portal never shows')
  })

  test('a cancelled and a past Booking have no actions', async () => {
    visit(
      'owner',
      lists(
        json(200, page([bookingBody(1, { state: 'cancelled' })])),
        json(200, page([bookingBody(2, { startsAt: PAST, endsAt: PAST_END })]))
      )
    )
    const upcoming = await screen.findByRole('list', { name: 'Upcoming Bookings' })
    const past = await screen.findByRole('list', { name: 'Past Bookings' })
    await within(upcoming).findByText(/Cancelled/)
    expect(within(upcoming).queryByRole('button')).toBeNull()
    expect(within(past).queryByRole('button')).toBeNull()
  })
})

describe('Bookings: reschedule', () => {
  const upcoming = lists(json(200, page([bookingBody(1)])))

  test('offers only the times of the same Rep and sends the one chosen', async () => {
    const portal = visit(
      'owner',
      upcoming,
      route('GET', SLOTS, slotsFor([SLOT_A], [SLOT_B, hexId('mem', 2)])),
      route(
        'POST',
        one(1, 'reschedule'),
        json(200, bookingBody(1, { startsAt: SLOT_A, endsAt: '2099-01-06T15:30:00Z' }))
      )
    )
    await portal.user.click(await screen.findByRole('button', { name: /^Reschedule the Booking/ }))
    const field = await screen.findByLabelText('New time')
    await waitFor(() => expect(field.hasAttribute('disabled')).toBe(false))
    await portal.user.click(field)
    const listbox = await screen.findByRole('listbox')
    expect(within(listbox).getAllByRole('option')).toHaveLength(1)
    await portal.user.keyboard('{Escape}')
    await choose(portal.user, field, SLOT_A)
    await portal.user.click(screen.getByRole('button', { name: 'Move Booking' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Booking moved.'))
    expect(portal.calls.find((call) => call.path === one(1, 'reschedule'))?.body).toEqual({
      startsAt: SLOT_A,
    })
    const read = portal.calls.find((call) => call.path === SLOTS)
    expect(param(read?.url ?? '', 'bookingTypeId')).toBe(hexId('bkt', 1))
    expect(param(read?.url ?? '', 'prospectId')).toBe(hexId('prs', 1))
  })

  test('a time that was just taken is explained and the panel stays open', async () => {
    const portal = visit(
      'owner',
      upcoming,
      route('GET', SLOTS, slotsFor([SLOT_A], [SLOT_B])),
      route('POST', one(1, 'reschedule'), failure(409, BOOKING_ERRORS['booking.slot_taken'].code))
    )
    await portal.user.click(await screen.findByRole('button', { name: /^Reschedule the Booking/ }))
    await choose(portal.user, await screen.findByLabelText('New time'), SLOT_A)
    await portal.user.click(screen.getByRole('button', { name: 'Move Booking' }))
    expect((await screen.findByText(/That time was just taken/)).textContent).not.toContain(
      'Text the portal never shows'
    )
    expect(screen.getByLabelText('New time')).toBeTruthy()
    expect(portal.calls.filter((call) => call.path === SLOTS).length).toBeGreaterThanOrEqual(1)
  })

  test('a Booking that is no longer active says so and the lists are read again', async () => {
    const portal = visit(
      'owner',
      upcoming,
      route('GET', SLOTS, slotsFor([SLOT_A])),
      route('POST', one(1, 'reschedule'), failure(409, BOOKING_ERRORS['booking.not_active'].code))
    )
    await portal.user.click(await screen.findByRole('button', { name: /^Reschedule the Booking/ }))
    await choose(portal.user, await screen.findByLabelText('New time'), SLOT_A)
    const before = portal.calls.filter((call) => call.path === BOOKINGS).length
    await portal.user.click(screen.getByRole('button', { name: 'Move Booking' }))
    expect(
      await screen.findByText(/This Booking was cancelled, so it cannot be moved/)
    ).toBeTruthy()
    await waitFor(() =>
      expect(portal.calls.filter((call) => call.path === BOOKINGS).length).toBeGreaterThan(before)
    )
  })

  test('Move Booking does nothing until a time is chosen', async () => {
    const portal = visit('owner', upcoming, route('GET', SLOTS, slotsFor([SLOT_A])))
    await portal.user.click(await screen.findByRole('button', { name: /^Reschedule the Booking/ }))
    await screen.findByLabelText('New time')
    await portal.user.click(screen.getByRole('button', { name: 'Move Booking' }))
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
  })
})

describe('Bookings: accessibility', () => {
  test.each(['light', 'dark'] as const)('has no axe violations in %s', async (theme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    const portal = visit(
      'owner',
      lists(
        json(200, page([bookingBody(1)])),
        json(200, page([bookingBody(2, { startsAt: PAST, endsAt: PAST_END })]))
      ),
      route('GET', SLOTS, slotsFor([SLOT_A]))
    )
    await portal.user.click(await screen.findByRole('button', { name: /^Reschedule the Booking/ }))
    await screen.findByLabelText('New time')
    await screen.findAllByText('Ada Rep')
    const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
    document.documentElement.classList.remove('dark')
    expect(result.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])
  })
})
