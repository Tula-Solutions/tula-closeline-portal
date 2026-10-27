import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen } from '@testing-library/react'
import axe from 'axe-core'
import { renderPortal } from '~/testing/render'
import { SECURITY_PAGE } from './copy/security'

const ALLOWED =
  /^(\/copilot|\/inbound-agent|\/outbound-agent|\/the-playbook|\/security|#main|\/sign-in|\/sign-up|\/book-a-demo|\/)$/
const STATUS = /^(Enforced by: .{20,}|Our promise: .{20,})/
const CERTIFICATIONS = /SOC ?2|ISO ?27001|HIPAA|GDPR|CASA|PCI|certified|compliant/i

/** Runs axe on the page. Colour contrast needs real layout, so the browser check covers it. */
async function violations() {
  const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
}

afterEach(() => {
  document.documentElement.classList.remove('dark')
  cleanup()
})

describe('the security and trust page', () => {
  test('has one h1, its own title and description, and only links that exist', async () => {
    renderPortal({ url: '/security' })
    expect(await screen.findAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(document.title).toBe(SECURITY_PAGE.meta.title)
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      SECURITY_PAGE.meta.description
    )
    for (const a of document.querySelectorAll('a[href]')) {
      expect(a.getAttribute('href') ?? '').toMatch(ALLOWED)
    }
  })

  test('every rule is numbered and says "Enforced by: <mechanism>" or "Our promise: ..."', async () => {
    renderPortal({ url: '/security' })
    await screen.findAllByRole('heading', { level: 1 })
    const items = document.querySelectorAll('ol[aria-label="The rules"] > li')
    expect(items.length).toBe(SECURITY_PAGE.rules.items.length)
    expect(items.length).toBeGreaterThanOrEqual(6)
    for (const item of items) {
      const status = item.querySelector('[data-status]')?.textContent ?? ''
      expect(status).toMatch(STATUS)
      expect(item.textContent ?? '').not.toMatch(/ADR|decision record/i)
    }
  })

  test('the copy gives every rule a status in its data, and promises the rules for Agents', () => {
    for (const rule of SECURITY_PAGE.rules.items) {
      expect(rule.status.line).toMatch(STATUS)
      expect(rule.status.kind === 'promise').toBe(rule.status.line.startsWith('Our promise'))
    }
    const promised = SECURITY_PAGE.rules.items.filter((r) => r.status.kind === 'promise')
    expect(promised.map((r) => r.id)).toEqual(
      expect.arrayContaining(['contact-consent', 'disclosure', 'region', 'deletion'])
    )
  })

  test('claims no certification and names the specimen as invented', async () => {
    renderPortal({ url: '/security' })
    await screen.findAllByRole('heading', { level: 1 })
    expect(document.body.textContent ?? '').not.toMatch(CERTIFICATIONS)
    expect(SECURITY_PAGE.noCertification).toMatch(/no security certification/)
    const figures = document.querySelectorAll('figure')
    expect(figures.length).toBeGreaterThan(0)
    expect(screen.getAllByText('Illustration, invented for this page')).toHaveLength(figures.length)
  })

  test('is reachable by a signed-in person and passes axe in light and dark', async () => {
    renderPortal({ url: '/security', signedIn: true })
    await screen.findAllByRole('heading', { level: 1 })
    expect(await violations()).toEqual([])
    document.documentElement.classList.add('dark')
    expect(await violations()).toEqual([])
  })

  test('the header links to Security and marks it current', async () => {
    renderPortal({ url: '/security' })
    await screen.findAllByRole('heading', { level: 1 })
    const link = document.querySelector('header nav a[href="/security"]')
    expect(link?.textContent).toBe('Security')
    expect(link?.getAttribute('aria-current')).toBe('page')
    expect(document.querySelector('header a[href="/#trust"]')).toBeNull()
  })
})
