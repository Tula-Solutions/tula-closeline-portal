import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { screen, waitFor } from '@testing-library/react'
import { tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

type VtDocument = { startViewTransition?: unknown }

const realMatchMedia = window.matchMedia
let start = mock((update: () => void | Promise<void>) => {
  void update()
  return { updateCallbackDone: Promise.resolve(), finished: Promise.resolve() }
})

function setReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  start = mock((update: () => void | Promise<void>) => {
    void update()
    return { updateCallbackDone: Promise.resolve(), finished: Promise.resolve() }
  })
  ;(document as unknown as VtDocument).startViewTransition = start
  setReducedMotion(false)
})

afterEach(() => {
  delete (document as unknown as VtDocument).startViewTransition
  window.matchMedia = realMatchMedia
})

describe('page transitions', () => {
  test('the first page is simply there; a later page change runs as a view transition', async () => {
    const portal = renderPortal({
      url: '/',
      signedIn: tokens({ organization: { id: 'org_1', role: 'owner' } }),
    })
    await screen.findByRole('heading', { name: 'Home' })
    expect(start).not.toHaveBeenCalled()
    await portal.router.navigate({ to: '/teams' })
    await waitFor(() => expect(start).toHaveBeenCalled())
  })

  test('under reduced motion no page change starts a view transition at all', async () => {
    setReducedMotion(true)
    const portal = renderPortal({
      url: '/',
      signedIn: tokens({ organization: { id: 'org_1', role: 'owner' } }),
    })
    await screen.findByRole('heading', { name: 'Home' })
    await portal.router.navigate({ to: '/teams' })
    await screen.findByRole('heading', { level: 1, name: 'Teams' })
    expect(start).not.toHaveBeenCalled()
  })
})
