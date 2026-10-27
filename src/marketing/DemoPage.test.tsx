import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { IDEMPOTENCY_KEY_HEADER } from 'tula-closeline-contract'
import { failure, json, route } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'
import { DEMO_PAGE } from './copy/demo'

const PATH = '/v1/marketing/demo-requests'
const ID = `dreq_${'a'.repeat(32)}`

afterEach(() => {
  cleanup()
})

async function fill(
  user: ReturnType<typeof renderPortal>['user'],
  values: { name?: string; email?: string; org?: string; message?: string } = {}
) {
  await user.type(
    await screen.findByLabelText(DEMO_PAGE.fields.name.label),
    values.name ?? 'Maya Okafor'
  )
  await user.type(
    screen.getByLabelText(DEMO_PAGE.fields.workEmail.label),
    values.email ?? 'maya@northline.app'
  )
  await user.type(
    screen.getByLabelText(DEMO_PAGE.fields.companyName.label),
    values.org ?? 'Northline'
  )
  if (values.message !== '') {
    await user.type(
      screen.getByLabelText(new RegExp(DEMO_PAGE.fields.message.label)),
      values.message ?? 'We would like to see the Copilot.'
    )
  }
}

describe('the book-a-demo page', () => {
  test('success shows the confirmation and sends the fields, the page and the key header', async () => {
    const { user, calls } = renderPortal({
      url: '/book-a-demo',
      handlers: [route('POST', PATH, json(201, { id: ID }))],
    })
    await fill(user)
    await user.click(screen.getByRole('button', { name: DEMO_PAGE.submit }))
    const confirmation = await screen.findByRole('heading', {
      name: DEMO_PAGE.confirmation.heading,
    })
    expect(document.activeElement).toBe(confirmation)
    const post = calls.filter((call) => call.method === 'POST')
    expect(post).toHaveLength(1)
    expect(post[0]?.body).toEqual({
      name: 'Maya Okafor',
      workEmail: 'maya@northline.app',
      companyName: 'Northline',
      message: 'We would like to see the Copilot.',
      sourcePage: '/book-a-demo',
      website: '',
    })
    expect(post[0]?.headers.get(IDEMPOTENCY_KEY_HEADER)?.length).toBeGreaterThanOrEqual(16)
    expect(screen.queryByLabelText(DEMO_PAGE.fields.name.label)).toBeNull()
  })

  test('the page never promises a reply time', async () => {
    renderPortal({ url: '/book-a-demo' })
    await screen.findByRole('heading', { level: 1 })
    const strings = JSON.stringify(DEMO_PAGE)
    expect(strings).not.toMatch(
      /\b(hours?|within|minutes?|days?|same day|24|48|asap|shortly|soon)\b/i
    )
  })

  test('a value the contract refuses shows a field error on that field and keeps the input', async () => {
    const { user, calls } = renderPortal({ url: '/book-a-demo' })
    // 201 characters: the contract allows an Organization name of at most 200.
    await fill(user, { org: 'x'.repeat(201) })
    await user.click(screen.getByRole('button', { name: DEMO_PAGE.submit }))
    const org = await screen.findByLabelText(DEMO_PAGE.fields.companyName.label)
    expect(org.getAttribute('aria-invalid')).toBe('true')
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
    expect((org as HTMLInputElement).value).toBe('x'.repeat(201))
    expect(
      screen.getByLabelText(DEMO_PAGE.fields.name.label).getAttribute('aria-invalid')
    ).toBeNull()
    const describedBy = org.getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(describedBy)?.textContent).toContain(
      DEMO_PAGE.fields.companyName.error
    )
    expect(document.activeElement).toBe(org)
  })

  test('marketing.invalid_request answered by core for values the page accepts shows a plain notice and keeps every input', async () => {
    const { user } = renderPortal({
      url: '/book-a-demo',
      handlers: [route('POST', PATH, failure(400, 'marketing.invalid_request'))],
    })
    await fill(user)
    await user.click(screen.getByRole('button', { name: DEMO_PAGE.submit }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(DEMO_PAGE.errors.invalid)
    expect((screen.getByLabelText(DEMO_PAGE.fields.name.label) as HTMLInputElement).value).toBe(
      'Maya Okafor'
    )
    expect(
      (screen.getByLabelText(DEMO_PAGE.fields.workEmail.label) as HTMLInputElement).value
    ).toBe('maya@northline.app')
    expect(document.activeElement).toBe(alert)
  })

  test('empty required fields and a bad email show field errors, linked and focused, without a request', async () => {
    const { user, calls } = renderPortal({ url: '/book-a-demo' })
    await user.type(await screen.findByLabelText(DEMO_PAGE.fields.workEmail.label), 'not-an-email')
    await user.click(screen.getByRole('button', { name: DEMO_PAGE.submit }))
    const name = screen.getByLabelText(DEMO_PAGE.fields.name.label)
    const email = screen.getByLabelText(DEMO_PAGE.fields.workEmail.label)
    const org = screen.getByLabelText(DEMO_PAGE.fields.companyName.label)
    for (const field of [name, email, org]) {
      expect(field.getAttribute('aria-invalid')).toBe('true')
      expect(field.getAttribute('aria-describedby')).toBeTruthy()
    }
    expect(
      screen.getByLabelText(new RegExp(DEMO_PAGE.fields.message.label)).getAttribute('aria-invalid')
    ).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(name))
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  })

  test('marketing.rate_limited shows a plain retry message, keeps the input and the same key on the retry', async () => {
    let attempts = 0
    const { user, calls } = renderPortal({
      url: '/book-a-demo',
      handlers: [
        route('POST', PATH, () => {
          attempts += 1
          return attempts === 1
            ? failure(429, 'marketing.rate_limited', { retryAfter: 60 }, { 'retry-after': '60' })
            : json(201, { id: ID })
        }),
      ],
    })
    await fill(user)
    await user.click(screen.getByRole('button', { name: DEMO_PAGE.submit }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(DEMO_PAGE.errors.rateLimited)
    expect((screen.getByLabelText(DEMO_PAGE.fields.name.label) as HTMLInputElement).value).toBe(
      'Maya Okafor'
    )
    await user.click(screen.getByRole('button', { name: DEMO_PAGE.submit }))
    await screen.findByRole('heading', { name: DEMO_PAGE.confirmation.heading })
    const keys = calls
      .filter((c) => c.method === 'POST')
      .map((c) => c.headers.get(IDEMPOTENCY_KEY_HEADER))
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  test('a failure with no answer keeps the input, says so, and the retry reuses the key', async () => {
    let attempts = 0
    const { user, calls } = renderPortal({
      url: '/book-a-demo',
      handlers: [
        route('POST', PATH, () => {
          attempts += 1
          return attempts === 1 ? failure(503, 'server.unavailable') : json(201, { id: ID })
        }),
      ],
    })
    await fill(user)
    await user.click(screen.getByRole('button', { name: DEMO_PAGE.submit }))
    expect((await screen.findByRole('alert')).textContent).toContain(DEMO_PAGE.errors.unreachable)
    await user.click(screen.getByRole('button', { name: DEMO_PAGE.submit }))
    await screen.findByRole('heading', { name: DEMO_PAGE.confirmation.heading })
    const keys = calls
      .filter((c) => c.method === 'POST')
      .map((c) => c.headers.get(IDEMPOTENCY_KEY_HEADER))
    expect(keys[0]).toBe(keys[1])
  })

  test('changing the message after a failure sends a new key, so core does not refuse it as a reused key', async () => {
    let attempts = 0
    const { user, calls } = renderPortal({
      url: '/book-a-demo',
      handlers: [
        route('POST', PATH, () => {
          attempts += 1
          return attempts === 1 ? failure(503, 'server.unavailable') : json(201, { id: ID })
        }),
      ],
    })
    await fill(user)
    await user.click(screen.getByRole('button', { name: DEMO_PAGE.submit }))
    await screen.findByRole('alert')
    await user.type(screen.getByLabelText(new RegExp(DEMO_PAGE.fields.message.label)), ' More.')
    await user.click(screen.getByRole('button', { name: DEMO_PAGE.submit }))
    await screen.findByRole('heading', { name: DEMO_PAGE.confirmation.heading })
    const keys = calls
      .filter((c) => c.method === 'POST')
      .map((c) => c.headers.get(IDEMPOTENCY_KEY_HEADER))
    expect(keys[0]).not.toBe(keys[1])
  })

  test('a double click sends one request', async () => {
    let release: (response: Response) => void = () => {}
    const gate = new Promise<Response>((resolve) => {
      release = resolve
    })
    const { user, calls } = renderPortal({
      url: '/book-a-demo',
      handlers: [route('POST', PATH, () => gate)],
    })
    await fill(user)
    const button = screen.getByRole('button', { name: DEMO_PAGE.submit })
    await user.dblClick(button)
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: DEMO_PAGE.sending }).getAttribute('aria-disabled')
      ).toBe('true')
    )
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
    release(json(201, { id: ID }))
    await screen.findByRole('heading', { name: DEMO_PAGE.confirmation.heading })
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
  })

  test('the honeypot is hidden from sight, the keyboard and assistive technology, and goes out as typed', async () => {
    const { user, calls } = renderPortal({
      url: '/book-a-demo',
      handlers: [route('POST', PATH, json(201, { id: ID }))],
    })
    await fill(user)
    const trap = document.querySelector<HTMLInputElement>('input[name="website"]')
    expect(trap).not.toBeNull()
    expect(trap?.getAttribute('tabindex')).toBe('-1')
    expect(trap?.getAttribute('autocomplete')).toBe('off')
    expect(trap?.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(trap?.hasAttribute('style')).toBe(false)
    expect(screen.queryByLabelText(/website/i)).toBeNull()
    if (trap) {
      await user.type(trap, 'http://spam.example')
    }
    await user.click(screen.getByRole('button', { name: DEMO_PAGE.submit }))
    // A filled trap is answered like a real request, so the page shows the same confirmation.
    await screen.findByRole('heading', { name: DEMO_PAGE.confirmation.heading })
    const body = calls.find((c) => c.method === 'POST')?.body as { website?: string } | undefined
    expect(body?.website).toBe('http://spam.example')
  })

  test('the form is operable by keyboard alone', async () => {
    const { user, calls } = renderPortal({
      url: '/book-a-demo',
      handlers: [route('POST', PATH, json(201, { id: ID }))],
    })
    const name = await screen.findByLabelText(DEMO_PAGE.fields.name.label)
    name.focus()
    await user.keyboard('Maya Okafor')
    await user.tab()
    await user.keyboard('maya@northline.app')
    await user.tab()
    await user.keyboard('Northline')
    await user.tab()
    await user.keyboard('Hello')
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: DEMO_PAGE.submit }))
    await user.keyboard('{Enter}')
    await screen.findByRole('heading', { name: DEMO_PAGE.confirmation.heading })
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
  })

  test('the page has one h1, its own title, no accessibility violations, and a nav link', async () => {
    renderPortal({ url: '/book-a-demo' })
    expect(await screen.findAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(document.title).toBe(DEMO_PAGE.meta.title)
    expect(
      screen
        .getAllByRole('link', { name: DEMO_PAGE.navLabel })
        .every((a) => a.getAttribute('href') === '/book-a-demo')
    ).toBe(true)
    const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
    expect(
      result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
    ).toEqual([])
  })
})
