import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { cleanup, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { failure, json, route } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const TOKEN = 'Zq7_manage-token0123456789abcdefghijklmnopq'
const BASE = `/v1/public/bookings/manage/${TOKEN}`
const FUTURE = new Date(Date.now() + 5 * 86_400_000)
FUTURE.setUTCHours(21, 0, 0, 0)
const START = FUTURE.toISOString().replace('.000Z', 'Z')
const END = new Date(FUTURE.getTime() + 30 * 60_000).toISOString().replace('.000Z', 'Z')
const NEXT = new Date(FUTURE.getTime() + 86_400_000).toISOString().replace('.000Z', 'Z')
const TYPE = { name: 'Intro call', lengthMinutes: 30, mode: 'video' }
const BOOKING = {
  id: `bkg_${'a'.repeat(32)}`,
  startsAt: START,
  endsAt: END,
  mode: 'video',
  joinUrl: 'https://meet.example/join/xyz',
  state: 'confirmed',
  bookingType: TYPE,
}
const SLOTS = {
  items: [START, NEXT].map((startsAt) => ({ startsAt, endsAt: startsAt })),
  nextCursor: null,
  bookingType: TYPE,
}

let zone: ReturnType<typeof spyOn>
beforeEach(() => {
  zone = spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
    timeZone: 'Pacific/Auckland',
  } as Intl.ResolvedDateTimeFormatOptions)
})
afterEach(() => {
  zone.mockRestore()
  cleanup()
  document.documentElement.classList.remove('dark')
})

function open(...handlers: ReturnType<typeof route>[]) {
  return renderPortal({
    url: `/book/manage/${TOKEN}`,
    handlers: [route('GET', BASE, json(200, BOOKING)), ...handlers],
  })
}

describe('the manage page', () => {
  test('shows the Booking, its time in the visitor zone, mode, join link and state', async () => {
    const { calls } = open()
    expect(await screen.findByRole('heading', { level: 1, name: 'Intro call' })).toBeTruthy()
    expect(screen.getByText('Video call')).toBeTruthy()
    expect(screen.getByText('Confirmed')).toBeTruthy()
    expect(screen.getByText(/GMT\+13|NZ/)).toBeTruthy()
    const join = screen.getByRole('link', { name: BOOKING.joinUrl })
    expect(join.getAttribute('rel')).toContain('noreferrer')
    expect(screen.getByRole('button', { name: 'Choose another time' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel this Booking' })).toBeTruthy()
    expect(calls.find((call) => call.path === BASE)?.headers.get('authorization')).toBeNull()
    expect(document.title).not.toContain(TOKEN)
    expect(document.body.textContent).not.toContain(TOKEN)
    expect(document.body.textContent).not.toContain(BOOKING.id)
  })

  test('registers the token with the reporter', async () => {
    const redacted: string[] = []
    renderPortal({
      url: `/book/manage/${TOKEN}`,
      redacted,
      handlers: [route('GET', BASE, json(200, BOOKING))],
    })
    await screen.findByRole('heading', { level: 1, name: 'Intro call' })
    expect(redacted).toContain(TOKEN)
  })

  test('cancel asks first, then shows the cancelled state with focus on it and no actions', async () => {
    const { user, calls } = open(
      route('POST', `${BASE}/cancel`, json(200, { ...BOOKING, state: 'cancelled' }))
    )
    await user.click(await screen.findByRole('button', { name: 'Cancel this Booking' }))
    expect(calls.some((call) => call.method === 'POST')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(screen.getByRole('button', { name: 'Cancel this Booking' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancel this Booking' }))
    await user.click(screen.getByRole('button', { name: 'Yes, cancel it' }))
    const heading = await screen.findByRole('heading', { name: 'This Booking is cancelled' })
    expect(document.activeElement).toBe(heading)
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /cancel this|another time/i })).toBeNull()
  })

  test('a cancelled Booking shows its state and no actions', async () => {
    renderPortal({
      url: `/book/manage/${TOKEN}`,
      handlers: [route('GET', BASE, json(200, { ...BOOKING, state: 'cancelled' }))],
    })
    await screen.findByRole('heading', { name: 'This Booking is cancelled' })
    expect(screen.queryByRole('button')).toBeNull()
  })

  test('a Booking that has started shows its state and no actions', async () => {
    const past = '2020-01-01T10:00:00Z'
    renderPortal({
      url: `/book/manage/${TOKEN}`,
      handlers: [route('GET', BASE, json(200, { ...BOOKING, startsAt: past, endsAt: past }))],
    })
    await screen.findByRole('heading', { name: 'This Booking has already started' })
    expect(screen.queryByRole('button')).toBeNull()
  })

  test('an unknown link shows one calm message and no detail', async () => {
    renderPortal({
      url: `/book/manage/${TOKEN}`,
      handlers: [route('GET', BASE, failure(404, 'booking.not_found'))],
    })
    expect(await screen.findByText(/This link no longer works/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  test('reschedule sends the chosen time with an Idempotency-Key and shows the new time', async () => {
    const moved = { ...BOOKING, startsAt: NEXT, endsAt: NEXT }
    const { user, calls } = open(
      route('GET', `${BASE}/slots`, json(200, SLOTS)),
      route('POST', `${BASE}/reschedule`, json(200, moved))
    )
    await user.click(await screen.findByRole('button', { name: 'Choose another time' }))
    const times = await screen.findAllByRole('button', { name: /10:00/ })
    await user.click(times[1] as HTMLElement)
    await user.click(await screen.findByRole('button', { name: 'Move my Booking' }))
    const heading = await screen.findByRole('heading', { name: 'Your Booking is moved' })
    expect(document.activeElement).toBe(heading)
    const post = calls.find((call) => call.method === 'POST')
    expect(post?.headers.get('idempotency-key')?.length).toBeGreaterThanOrEqual(16)
    expect(post?.body).toEqual({ startsAt: NEXT, timeZone: 'Pacific/Auckland' })
    expect(
      calls.find((call) => call.path.endsWith('/slots'))?.headers.get('authorization')
    ).toBeNull()
  })

  test('a Booking still being moved is retried after Retry-After with the same key', async () => {
    let attempts = 0
    const waits: number[] = []
    const { user, calls } = renderPortal({
      url: `/book/manage/${TOKEN}`,
      sleep: async (ms) => {
        waits.push(ms)
      },
      handlers: [
        route('GET', BASE, json(200, BOOKING)),
        route('GET', `${BASE}/slots`, json(200, SLOTS)),
        route('POST', `${BASE}/reschedule`, () => {
          attempts += 1
          return attempts === 1
            ? failure(409, 'request.idempotency_in_progress', undefined, { 'Retry-After': '2' })
            : json(200, { ...BOOKING, startsAt: NEXT, endsAt: NEXT })
        }),
      ],
    })
    await user.click(await screen.findByRole('button', { name: 'Choose another time' }))
    await user.click((await screen.findAllByRole('button', { name: /10:00/ }))[1] as HTMLElement)
    await user.click(await screen.findByRole('button', { name: 'Move my Booking' }))
    await screen.findByRole('heading', { name: 'Your Booking is moved' })
    const keys = calls
      .filter((call) => call.method === 'POST')
      .map((call) => call.headers.get('idempotency-key'))
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1] as string)
    expect(waits).toContain(2000)
  })

  test('never waits longer than ten seconds for a move that is still running', async () => {
    const waits: number[] = []
    let attempts = 0
    const { user } = renderPortal({
      url: `/book/manage/${TOKEN}`,
      sleep: async (ms) => {
        waits.push(ms)
      },
      handlers: [
        route('GET', BASE, json(200, BOOKING)),
        route('GET', `${BASE}/slots`, json(200, SLOTS)),
        route('POST', `${BASE}/reschedule`, () => {
          attempts += 1
          return attempts === 1
            ? failure(409, 'request.idempotency_in_progress', undefined, { 'Retry-After': '3600' })
            : json(200, { ...BOOKING, startsAt: NEXT, endsAt: NEXT })
        }),
      ],
    })
    await user.click(await screen.findByRole('button', { name: 'Choose another time' }))
    await user.click((await screen.findAllByRole('button', { name: /10:00/ }))[1] as HTMLElement)
    await user.click(await screen.findByRole('button', { name: 'Move my Booking' }))
    await screen.findByRole('heading', { name: 'Your Booking is moved' })
    expect(Math.max(...waits)).toBeLessThanOrEqual(10_000)
  })

  test('a taken time says so, reloads the times and asks for another', async () => {
    let reads = 0
    const { user } = open(
      route('GET', `${BASE}/slots`, () => {
        reads += 1
        return json(200, reads === 1 ? SLOTS : { ...SLOTS, items: SLOTS.items.slice(1) })
      }),
      route('POST', `${BASE}/reschedule`, failure(409, 'booking.slot_taken'))
    )
    await user.click(await screen.findByRole('button', { name: 'Choose another time' }))
    await user.click((await screen.findAllByRole('button', { name: /10:00/ }))[0] as HTMLElement)
    await user.click(await screen.findByRole('button', { name: 'Move my Booking' }))
    expect(await screen.findByText(/just taken/)).toBeTruthy()
    await waitFor(() => expect(reads).toBe(2))
    await screen.findByRole('heading', { name: 'Pick a new time' })
    expect(screen.getAllByRole('button', { name: /10:00/ })).toHaveLength(1)
  })

  test('says the calendar is down and keeps the Booking as it was', async () => {
    const { user } = open(
      route('GET', `${BASE}/slots`, json(200, SLOTS)),
      route('POST', `${BASE}/reschedule`, failure(503, 'booking.calendar_unavailable'))
    )
    await user.click(await screen.findByRole('button', { name: 'Choose another time' }))
    await user.click((await screen.findAllByRole('button', { name: /10:00/ }))[0] as HTMLElement)
    await user.click(await screen.findByRole('button', { name: 'Move my Booking' }))
    expect(await screen.findByText(/calendar is not available/)).toBeTruthy()
  })

  test('a cancel answered with booking.not_active shows the cancelled state', async () => {
    const { user } = open(route('POST', `${BASE}/cancel`, failure(409, 'booking.not_active')))
    await user.click(await screen.findByRole('button', { name: 'Cancel this Booking' }))
    await user.click(screen.getByRole('button', { name: 'Yes, cancel it' }))
    await screen.findByRole('heading', { name: 'This Booking is cancelled' })
  })

  for (const theme of ['light', 'dark']) {
    test(`has no axe violations on the Booking, the cancel step and the picker (${theme})`, async () => {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
      }
      const { user } = open(route('GET', `${BASE}/slots`, json(200, SLOTS)))
      const check = async () => {
        const result = await axe.run(document.body, {
          rules: { 'color-contrast': { enabled: false } },
        })
        expect(result.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])
      }
      await screen.findByRole('heading', { level: 1, name: 'Intro call' })
      await check()
      await user.click(screen.getByRole('button', { name: 'Cancel this Booking' }))
      await check()
      await user.click(screen.getByRole('button', { name: 'Keep it' }))
      await user.click(screen.getByRole('button', { name: 'Choose another time' }))
      await screen.findAllByRole('button', { name: /10:00/ })
      await check()
    })
  }
})
