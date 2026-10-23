import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, screen } from '@testing-library/react'
import axe from 'axe-core'
import { AUTH_ERRORS } from 'tula-closeline-contract'
import { failure, route } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const REFRESH = '/v1/client/sessions/refresh'

/** Runs axe on the page. Colour contrast needs real layout, so the browser check covers it. */
async function violations() {
  const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
}

function stubReducedMotion(reduce: boolean) {
  const original = window.matchMedia
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia
  return () => {
    window.matchMedia = original
  }
}

afterEach(() => {
  document.documentElement.classList.remove('dark')
  cleanup()
})

describe('the public home at /', () => {
  test('a visitor who is not signed in sees the site, with exactly one h1 and a skip link', async () => {
    renderPortal({ url: '/' })
    const headings = await screen.findAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent).toBe('Sales, held in balance between a Rep and an AI.')
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe('#main')
    expect(document.getElementById('main')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/sign-in')
    expect(screen.getAllByRole('link', { name: 'Sign up' })[0]?.getAttribute('href')).toBe(
      '/sign-up'
    )
    expect(screen.queryByRole('heading', { name: 'Home' })).toBeNull()
  })

  test('a signed-in person keeps Home at /', async () => {
    renderPortal({ url: '/', signedIn: true })
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 1, name: /balance/ })).toBeNull()
  })

  test('a session that cannot be restored shows the site, not an error', async () => {
    renderPortal({
      url: '/',
      restore: true,
      handlers: [route('POST', REFRESH, failure(401, AUTH_ERRORS['session.invalid_token'].code))],
    })
    expect((await screen.findAllByRole('heading', { level: 1 })).length).toBe(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('labels what is not built yet, with its phase, and what is', async () => {
    renderPortal({ url: '/' })
    await screen.findAllByRole('heading', { level: 1 })
    expect(screen.getByText('Planned, phase 2')).toBeTruthy()
    expect(screen.getByText('Planned, phase 3')).toBeTruthy()
    expect(screen.getByText('Planned, phase 4')).toBeTruthy()
    expect(screen.getByText('Built today')).toBeTruthy()
  })

  test('every specimen says it is invented', async () => {
    renderPortal({ url: '/' })
    await screen.findAllByRole('heading', { level: 1 })
    const captions = screen.getAllByText('Illustration, invented for this page')
    expect(captions).toHaveLength(document.querySelectorAll('figure > dl').length)
    expect(captions.length).toBe(2)
  })

  test('only links to pages that exist: sections of this page, sign-in and sign-up', async () => {
    renderPortal({ url: '/' })
    await screen.findAllByRole('heading', { level: 1 })
    const hrefs = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href') ?? '')
      .filter((href) => href !== '#main')
    for (const href of hrefs) {
      expect(href).toMatch(/^(\/#[a-z-]+|\/sign-in|\/sign-up|\/)$/)
    }
  })

  test('has no axe violations in the light theme', async () => {
    renderPortal({ url: '/' })
    await screen.findAllByRole('heading', { level: 1 })
    expect(await violations()).toEqual([])
  })

  test('has no axe violations in the dark theme', async () => {
    document.documentElement.classList.add('dark')
    renderPortal({ url: '/' })
    await screen.findAllByRole('heading', { level: 1 })
    expect(await violations()).toEqual([])
  })
})

describe('the scale', () => {
  function beamTransform() {
    return document.querySelector('[data-part="beam"]')?.getAttribute('transform') ?? null
  }

  async function scrollTo(y: number) {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: 4000,
      configurable: true,
    })
    await act(async () => {
      window.dispatchEvent(new Event('scroll'))
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
  }

  test('leans as the page scrolls', async () => {
    const restore = stubReducedMotion(false)
    try {
      renderPortal({ url: '/' })
      await screen.findAllByRole('heading', { level: 1 })
      expect(beamTransform()).toBeNull()
      await scrollTo(500)
      expect(beamTransform()).toMatch(/^rotate\(/)
      expect(beamTransform()).not.toBe('rotate(0 0 -34)')
    } finally {
      restore()
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    }
  })

  test('stays fully still when the reader prefers reduced motion', async () => {
    const restore = stubReducedMotion(true)
    try {
      renderPortal({ url: '/' })
      await screen.findAllByRole('heading', { level: 1 })
      await scrollTo(500)
      expect(beamTransform()).toBeNull()
      expect(
        document.querySelector('[data-part="solid-pan"]')?.getAttribute('transform')
      ).toBeNull()
    } finally {
      restore()
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    }
  })
})
