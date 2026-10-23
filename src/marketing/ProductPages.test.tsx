import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen } from '@testing-library/react'
import axe from 'axe-core'
import { renderPortal } from '~/testing/render'
import { PRODUCT_PAGES } from './copy/products'

const PAGES = [
  { url: '/copilot', copy: PRODUCT_PAGES.copilot, label: 'Planned, phase 2' },
  { url: '/inbound-agent', copy: PRODUCT_PAGES.inbound, label: 'Planned, phase 3' },
  { url: '/outbound-agent', copy: PRODUCT_PAGES.outbound, label: 'Planned, phase 4' },
  { url: '/the-playbook', copy: PRODUCT_PAGES.playbook, label: 'Built today' },
] as const

const ALLOWED =
  /^(\/#trust|\/copilot|\/inbound-agent|\/outbound-agent|\/the-playbook|#main|\/sign-in|\/sign-up|\/)$/

/** Runs axe on the page. Colour contrast needs real layout, so the browser check covers it. */
async function violations() {
  const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
}

afterEach(() => {
  document.documentElement.classList.remove('dark')
  cleanup()
})

describe('the four product pages', () => {
  for (const page of PAGES) {
    test(`${page.url} has one h1, its own title, a caption per specimen and its availability`, async () => {
      renderPortal({ url: page.url })
      const headings = await screen.findAllByRole('heading', { level: 1 })
      expect(headings).toHaveLength(1)
      expect(document.title).toBe(page.copy.meta.title)
      expect(screen.getAllByText(page.label).length).toBeGreaterThan(0)
      const figures = document.querySelectorAll('figure')
      expect(figures.length).toBeGreaterThan(0)
      expect(screen.getAllByText('Illustration, invented for this page')).toHaveLength(
        figures.length
      )
      for (const a of document.querySelectorAll('a[href]')) {
        expect(a.getAttribute('href') ?? '').toMatch(ALLOWED)
      }
    })

    test(`${page.url} is reachable by a signed-in person and passes axe in light and dark`, async () => {
      renderPortal({ url: page.url, signedIn: true })
      await screen.findAllByRole('heading', { level: 1 })
      expect(await violations()).toEqual([])
      document.documentElement.classList.add('dark')
      expect(await violations()).toEqual([])
    })
  }

  test('titles and descriptions are unique', () => {
    const titles = PAGES.map((p) => p.copy.meta.title)
    const descriptions = PAGES.map((p) => p.copy.meta.description)
    expect(new Set(titles).size).toBe(4)
    expect(new Set(descriptions).size).toBe(4)
  })

  test('the header links to every page and marks the current one', async () => {
    renderPortal({ url: '/copilot' })
    await screen.findAllByRole('heading', { level: 1 })
    for (const page of PAGES) {
      const link = document.querySelector(`header a[href="${page.url}"]`)
      expect(link).not.toBeNull()
      expect(link?.getAttribute('aria-current') === 'page').toBe(page.url === '/copilot')
    }
  })
})
