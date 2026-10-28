import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { hexId } from '~/testing/core-bodies'
import { failure, json, route } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'
import { CONSENT_FORM_PAGE as copy } from './copy/consent-form'

const TOKEN = 'Tk-consent_0123456789abcdef0123456789abcdef'
const VIEW_PATH = `/v1/public/consent-forms/${TOKEN}`
const SUBMIT_PATH = `${VIEW_PATH}/submissions`
const VIEW = {
  organizationName: 'Northline <b>Co</b>',
  wordingId: hexId('cwd', 1),
  wordingVersion: 2,
  wordingText: 'We may call you about <i>Northline</i> products.',
  channels: ['phone', 'sms', 'email'],
}
const RECEIPT = { channels: ['phone', 'email'], recordedAt: '2026-10-23T10:00:00Z' }

afterEach(() => {
  cleanup()
})

function open(...handlers: ReturnType<typeof route>[]) {
  return renderPortal({
    url: `/consent/${TOKEN}`,
    handlers: [route('GET', VIEW_PATH, json(200, VIEW)), ...handlers],
  })
}

describe('the hosted consent page', () => {
  test('shows the wording as text, every channel unticked, and the ADR 0003 explanation', async () => {
    const { calls } = open()
    await screen.findByText('We may call you about <i>Northline</i> products.')
    expect(screen.getByText(/Northline <b>Co<\/b>/)).toBeTruthy()
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes).toHaveLength(3)
    expect(boxes.every((box) => !box.checked)).toBe(true)
    expect(screen.queryByRole('checkbox', { name: /LinkedIn/ })).toBeNull()
    for (const point of copy.explainer.points) {
      expect(screen.getByText(point)).toBeTruthy()
    }
    const view = calls.find((call) => call.path === VIEW_PATH)
    expect(view?.headers.get('authorization')).toBeNull()
    expect(document.title).not.toContain('Tk-')
    expect(calls.every((call) => call.method === 'GET')).toBe(true)
  })

  test('refuses to send with nothing ticked and says why', async () => {
    const { user, calls } = open()
    await user.click(await screen.findByRole('button', { name: copy.button }))
    expect(await screen.findByText(copy.errors.choices)).toBeTruthy()
    expect(calls.some((call) => call.method === 'POST')).toBe(false)
  })

  test('asks for the phone and email the ticked channels need, with focus on the first error', async () => {
    const { user, calls } = open()
    await user.click(await screen.findByRole('checkbox', { name: 'Phone' }))
    await user.click(screen.getByRole('checkbox', { name: 'Email' }))
    await user.click(screen.getByRole('button', { name: copy.button }))
    expect(await screen.findByText(copy.errors.phone)).toBeTruthy()
    expect(screen.getByText(copy.errors.email)).toBeTruthy()
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByLabelText(copy.contact.phone, { exact: false })
      )
    )
    expect(calls.some((call) => call.method === 'POST')).toBe(false)
  })

  test('submits the choices with an Idempotency-Key and no sign-in, then shows a receipt without the address', async () => {
    const { user, calls } = open(route('POST', SUBMIT_PATH, json(201, RECEIPT)))
    await user.click(await screen.findByRole('checkbox', { name: 'Phone' }))
    await user.click(screen.getByRole('checkbox', { name: 'Email' }))
    await user.type(screen.getByLabelText(copy.contact.phone, { exact: false }), '+14155550123')
    await user.type(
      screen.getByLabelText(copy.contact.email, { exact: false }),
      'maya@northline.app'
    )
    await user.click(screen.getByRole('button', { name: copy.button }))
    const heading = await screen.findByRole('heading', { name: copy.done.heading })
    expect(document.activeElement).toBe(heading)
    const post = calls.filter((call) => call.method === 'POST')
    expect(post).toHaveLength(1)
    expect(post[0]?.headers.get('authorization')).toBeNull()
    expect(post[0]?.headers.get('idempotency-key')?.length).toBeGreaterThanOrEqual(16)
    expect(post[0]?.body).toEqual({
      wordingId: VIEW.wordingId,
      phone: '+14155550123',
      email: 'maya@northline.app',
      choices: [
        { channel: 'phone', agreed: true },
        { channel: 'sms', agreed: false },
        { channel: 'email', agreed: true },
      ],
    })
    expect(screen.getByText('Phone, Email')).toBeTruthy()
    expect(document.body.textContent).not.toContain('maya@northline.app')
    expect(document.body.textContent).not.toContain('+14155550123')
  })

  test('a link that does not work gets one calm message and no form', async () => {
    renderPortal({
      url: `/consent/${TOKEN}`,
      handlers: [route('GET', VIEW_PATH, failure(400, 'consent.invalid_token'))],
    })
    const heading = await screen.findByRole('heading', { name: copy.invalid.heading })
    expect(document.activeElement).toBe(heading)
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  test('a rate limit on submit keeps the form and the answers', async () => {
    const { user } = open(route('POST', SUBMIT_PATH, failure(429, 'rate.limited')))
    await user.click(await screen.findByRole('checkbox', { name: 'Phone' }))
    await user.type(screen.getByLabelText(copy.contact.phone, { exact: false }), '+14155550123')
    await user.click(screen.getByRole('button', { name: copy.button }))
    expect(await screen.findByText(/Too many tries/)).toBeTruthy()
    expect((screen.getByRole('checkbox', { name: 'Phone' }) as HTMLInputElement).checked).toBe(true)
  })

  test('has no accessibility violations', async () => {
    open()
    await screen.findByRole('button', { name: copy.button })
    const result = await axe.run(document.body)
    expect(result.violations).toEqual([])
  })
})
