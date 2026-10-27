import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen } from '@testing-library/react'
import axe from 'axe-core'
import { failure, json, route } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'
import { UNSUBSCRIBE_PAGE as copy } from './copy/unsubscribe'

const TOKEN = 'tok_abcdefghijklmnop'
const PATH = `/v1/public/unsubscribe/${TOKEN}`
const PREVIEW = { organizationName: 'Northline', channel: 'email' }
const RECEIPT = { unsubscribed: true, recordedAt: '2026-10-23T10:00:00Z' }

afterEach(() => {
  cleanup()
})

describe('the unsubscribe page', () => {
  test('shows who sent the message, then unsubscribes in one click without signing in', async () => {
    const { user, calls } = renderPortal({
      url: `/unsubscribe/${TOKEN}`,
      handlers: [route('GET', PATH, json(200, PREVIEW)), route('POST', PATH, json(200, RECEIPT))],
    })
    await screen.findByText(/Northline/)
    // Reading the link changes nothing.
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: copy.confirm.button }))
    const heading = await screen.findByRole('heading', { name: copy.done.heading })
    expect(document.activeElement).toBe(heading)
    const post = calls.filter((call) => call.method === 'POST')
    expect(post).toHaveLength(1)
    expect(post[0]?.body).toEqual({ 'List-Unsubscribe': 'One-Click' })
    expect(post[0]?.headers.get('authorization')).toBeNull()
  })

  test('the button is a real form posting the one-click pair, so it works without a script', async () => {
    renderPortal({
      url: `/unsubscribe/${TOKEN}`,
      handlers: [route('GET', PATH, json(200, PREVIEW))],
    })
    const button = await screen.findByRole('button', { name: copy.confirm.button })
    const form = button.closest('form')
    expect(form?.getAttribute('method')).toBe('post')
    expect(form?.getAttribute('action')).toBe(PATH)
    expect(form?.querySelector('input[name="List-Unsubscribe"]')?.getAttribute('value')).toBe(
      'One-Click'
    )
  })

  test('an invalid or expired link shows one calm message with no address', async () => {
    renderPortal({
      url: `/unsubscribe/${TOKEN}`,
      handlers: [route('GET', PATH, failure(400, 'consent.invalid_token'))],
    })
    const heading = await screen.findByRole('heading', { name: copy.invalid.heading })
    expect(document.activeElement).toBe(heading)
    expect(screen.queryByRole('button', { name: copy.confirm.button })).toBeNull()
    expect(document.body.textContent).not.toMatch(/@/)
    expect(document.body.textContent).not.toContain(TOKEN)
  })

  test('a link that turns out invalid at the click shows the same message', async () => {
    const { user } = renderPortal({
      url: `/unsubscribe/${TOKEN}`,
      handlers: [
        route('GET', PATH, json(200, PREVIEW)),
        route('POST', PATH, failure(400, 'consent.invalid_token')),
      ],
    })
    await user.click(await screen.findByRole('button', { name: copy.confirm.button }))
    expect(await screen.findByRole('heading', { name: copy.invalid.heading })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: copy.done.heading })).toBeNull()
  })

  test('a rate limit is worded by its code and can be retried', async () => {
    const { user } = renderPortal({
      url: `/unsubscribe/${TOKEN}`,
      handlers: [
        route('GET', PATH, json(200, PREVIEW)),
        route('POST', PATH, failure(429, 'rate.limited', undefined, { 'retry-after': '30' })),
      ],
    })
    await user.click(await screen.findByRole('button', { name: copy.confirm.button }))
    expect(await screen.findByText(copy.rateLimited)).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.confirm.button })).toBeTruthy()
  })

  test('markup in a sender name is shown as text', async () => {
    renderPortal({
      url: `/unsubscribe/${TOKEN}`,
      handlers: [
        route('GET', PATH, json(200, { ...PREVIEW, organizationName: '<img src=x onerror=1>' })),
      ],
    })
    await screen.findByText('<img src=x onerror=1>')
    expect(document.querySelector('img[src="x"]')).toBeNull()
  })

  test('has no accessibility violations', async () => {
    renderPortal({
      url: `/unsubscribe/${TOKEN}`,
      handlers: [route('GET', PATH, json(200, PREVIEW))],
    })
    await screen.findByRole('button', { name: copy.confirm.button })
    const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
    expect(result.violations).toEqual([])
  })
})
