import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { cleanup, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { failure, json, route } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const TOKEN = 'Tk-booking_0123456789abcdef0123456789abcdef'
const SLOTS = `/v1/public/booking-types/${TOKEN}/slots`
const BOOK = `/v1/public/booking-types/${TOKEN}/bookings`
const MANAGE = 'Zq7_manage-token0123456789abcdefghijklmnopq'
const TYPE = { name: 'Intro call', lengthMinutes: 30, mode: 'video' }
// 21:00 UTC on 3 Nov is 10:00 on 4 Nov in Auckland (UTC+13).
const FIRST = '2026-11-03T21:00:00Z'
const SECOND = '2026-11-03T21:30:00Z'
const THIRD = '2026-11-04T21:00:00Z'
const PAGE = {
  items: [FIRST, SECOND, THIRD].map((startsAt) => ({ startsAt, endsAt: startsAt })),
  nextCursor: null,
  bookingType: TYPE,
}
const CONFIRMATION = {
  id: `bkg_${'a'.repeat(32)}`,
  startsAt: FIRST,
  endsAt: '2026-11-03T21:30:00Z',
  mode: 'video',
  joinUrl: 'https://meet.example/join/xyz',
  manageToken: MANAGE,
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
    url: `/book/${TOKEN}`,
    handlers: [route('GET', SLOTS, json(200, PAGE)), ...handlers],
  })
}

async function fillAndBook(user: ReturnType<typeof open>['user']) {
  await user.click((await screen.findAllByRole('button', { name: /10:00/ }))[0] as HTMLElement)
  await user.type(screen.getByLabelText('Name'), 'Maya Chen')
  await user.type(screen.getByLabelText('Work email'), 'maya@northline.app')
  await user.click(screen.getByRole('button', { name: 'Book this time' }))
}

describe('the public booking page', () => {
  test('shows the Booking Type and the free times in the visitor zone, grouped by day', async () => {
    const { calls } = open()
    expect(await screen.findByRole('heading', { level: 1, name: 'Intro call' })).toBeTruthy()
    expect(screen.getByText('30 minutes')).toBeTruthy()
    expect(screen.getByText('Video call')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /10:00/ })).toHaveLength(2)
    expect(screen.getByRole('button', { name: /10:30/ })).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2)
    expect(screen.getByText('Pacific/Auckland')).toBeTruthy()
    expect(calls.find((call) => call.path === SLOTS)?.headers.get('authorization')).toBeNull()
    expect(document.title).not.toContain('Tk-')
  })

  test('books with an Idempotency-Key and the visitor zone, then confirms without ids', async () => {
    const { user, calls } = open(route('POST', BOOK, json(201, CONFIRMATION)))
    await fillAndBook(user)
    const heading = await screen.findByRole('heading', { name: 'You are booked' })
    expect(document.activeElement).toBe(heading)
    const post = calls.find((call) => call.method === 'POST')
    expect(post?.headers.get('idempotency-key')?.length).toBeGreaterThanOrEqual(16)
    expect(post?.body).toEqual({
      name: 'Maya Chen',
      email: 'maya@northline.app',
      startsAt: FIRST,
      timeZone: 'Pacific/Auckland',
      website: '',
    })
    expect(screen.getAllByText('Video call')).toHaveLength(2)
    expect(screen.getByRole('link', { name: CONFIRMATION.joinUrl }).getAttribute('href')).toBe(
      CONFIRMATION.joinUrl
    )
    expect(screen.getByText(/calendar invitation comes from the calendar/)).toBeTruthy()
    expect(document.body.textContent).not.toContain(CONFIRMATION.id)
    expect(document.body.textContent).not.toContain(TOKEN)
    const manage = screen.getByRole('link', { name: 'Manage this Booking' })
    expect(manage.getAttribute('href')).toBe(`/book/manage/${MANAGE}`)
    expect(screen.getByText(/only way back/)).toBeTruthy()
    expect(document.body.textContent).not.toContain(MANAGE)
    expect(document.title).not.toContain(MANAGE)
  })

  test('a retry after a network failure reuses the same Idempotency-Key', async () => {
    let attempts = 0
    const { user, calls } = open(
      route('POST', BOOK, () => {
        attempts += 1
        if (attempts === 1) {
          return failure(503, 'service.unavailable')
        }
        return json(200, CONFIRMATION)
      })
    )
    await fillAndBook(user)
    await user.click(await screen.findByRole('button', { name: 'Book this time' }))
    await screen.findByRole('heading', { name: 'You are booked' })
    const keys = calls
      .filter((call) => call.method === 'POST')
      .map((c) => c.headers.get('idempotency-key'))
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  test('checks name and email at the edge before sending anything', async () => {
    const { user, calls } = open()
    await user.click(await screen.findByRole('button', { name: /10:30/ }))
    await user.type(screen.getByLabelText('Work email'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Book this time' }))
    expect(await screen.findByText(/Enter your name/)).toBeTruthy()
    expect(screen.getByText(/Enter a valid work email/)).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText('Name'))
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0)
  })

  test('the honeypot is hidden from people and assistive technology, and a filled one is still sent', async () => {
    const { user, calls } = open(route('POST', BOOK, json(201, CONFIRMATION)))
    await user.click((await screen.findAllByRole('button', { name: /10:00/ }))[0] as HTMLElement)
    const trap = document.querySelector<HTMLInputElement>('input[name="website"]')
    expect(trap?.tabIndex).toBe(-1)
    expect(trap?.getAttribute('autocomplete')).toBe('off')
    expect(trap?.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Website' })).toBeNull()
    if (trap) {
      await user.type(trap, 'http://spam.example')
    }
    await user.type(screen.getByLabelText('Name'), 'Maya Chen')
    await user.type(screen.getByLabelText('Work email'), 'maya@northline.app')
    await user.click(screen.getByRole('button', { name: 'Book this time' }))
    await screen.findByRole('heading', { name: 'You are booked' })
    const post = calls.find((call) => call.method === 'POST')
    expect(post?.body).toMatchObject({ website: 'http://spam.example' })
  })

  test('a taken time says so and reloads the times to pick again', async () => {
    let reads = 0
    const { user } = renderPortal({
      url: `/book/${TOKEN}`,
      handlers: [
        route('GET', SLOTS, () => {
          reads += 1
          return json(200, reads === 1 ? PAGE : { ...PAGE, items: PAGE.items.slice(1) })
        }),
        route('POST', BOOK, failure(409, 'booking.slot_taken')),
      ],
    })
    await fillAndBook(user)
    expect(await screen.findByText(/just taken/)).toBeTruthy()
    await waitFor(() => expect(reads).toBe(2))
    await screen.findByRole('heading', { name: 'Pick a time' })
    expect(screen.queryAllByRole('button', { name: /10:00/ })).toHaveLength(1)
  })

  test('a link that no longer works shows one message and no times', async () => {
    renderPortal({
      url: `/book/${TOKEN}`,
      handlers: [route('GET', SLOTS, failure(404, 'booking.type_not_found'))],
    })
    expect(await screen.findByText(/This booking link no longer works/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /10:00/ })).toBeNull()
  })

  test('a rate limit tells the visitor to wait, using Retry-After', async () => {
    const { user } = open(
      route('POST', BOOK, failure(429, 'rate.limited', undefined, { 'Retry-After': '90' }))
    )
    await fillAndBook(user)
    expect(await screen.findByText(/Try again in 2 minutes|Try again in 90 seconds/)).toBeTruthy()
  })

  test('says so when the calendar is down or no Rep is free', async () => {
    const { user } = open(route('POST', BOOK, failure(503, 'booking.calendar_unavailable')))
    await fillAndBook(user)
    expect(await screen.findByText(/calendar is not available/)).toBeTruthy()
  })

  test('offers later times while the API has another page', async () => {
    let cursorSeen: string | null = null
    const { user } = renderPortal({
      url: `/book/${TOKEN}`,
      handlers: [
        route('GET', SLOTS, (request) => {
          cursorSeen = new URL(request.url, 'http://x').searchParams.get('cursor')
          return cursorSeen
            ? json(200, { ...PAGE, items: [{ startsAt: THIRD, endsAt: THIRD }], nextCursor: null })
            : json(200, { ...PAGE, nextCursor: 'next-page' })
        }),
      ],
    })
    await user.click(await screen.findByRole('button', { name: 'Later times' }))
    await waitFor(() => expect(cursorSeen).toBe('next-page'))
  })

  test('registers the token with the reporter and keeps it out of reports', async () => {
    const redacted: string[] = []
    const { reports } = renderPortal({
      url: `/book/${TOKEN}`,
      redacted,
      handlers: [route('GET', SLOTS, failure(500, 'internal.error'))],
    })
    await screen.findByRole('button', { name: 'Try again' })
    expect(redacted).toContain(TOKEN)
    expect(reports.map((error) => error.message).join(' ')).not.toContain(TOKEN)
    expect(document.title).not.toContain(TOKEN)
    expect(document.body.textContent).not.toContain(TOKEN)
  })

  for (const theme of ['light', 'dark']) {
    test(`has no axe violations on the times, the form and the confirmation (${theme})`, async () => {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
      }
      const { user } = open(route('POST', BOOK, json(201, CONFIRMATION)))
      const check = async () => {
        const result = await axe.run(document.body, {
          rules: { 'color-contrast': { enabled: false } },
        })
        expect(result.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])
      }
      await screen.findByRole('heading', { level: 1, name: 'Intro call' })
      await check()
      await user.click(screen.getAllByRole('button', { name: /10:00/ })[0] as HTMLElement)
      await check()
      await user.type(screen.getByLabelText('Name'), 'Maya Chen')
      await user.type(screen.getByLabelText('Work email'), 'maya@northline.app')
      await user.click(screen.getByRole('button', { name: 'Book this time' }))
      await screen.findByRole('heading', { name: 'You are booked' })
      await check()
    })
  }
})
