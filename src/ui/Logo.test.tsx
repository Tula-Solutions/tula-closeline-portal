import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { render } from '@testing-library/react'
import { ScalesMark } from '~/ui/Logo'
import { resetFirstTime } from '~/ui/motion'

const realMatchMedia = window.matchMedia
const realAnimate = Element.prototype.animate
let animate = mock(() => ({}) as Animation)

function setReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  sessionStorage.clear()
  resetFirstTime()
  animate = mock(() => ({}) as Animation)
  Element.prototype.animate = animate as unknown as typeof Element.prototype.animate
  setReducedMotion(false)
})

afterEach(() => {
  Element.prototype.animate = realAnimate
  window.matchMedia = realMatchMedia
  sessionStorage.clear()
  resetFirstTime()
})

describe('the scales drawing', () => {
  test('draws itself the first time in a tab, and only the first time', () => {
    const first = render(<ScalesMark drawIn />)
    const drawn = animate.mock.calls.length
    // Construction lines, post, beam, hangers, pans and the rock about the pivot.
    expect(drawn).toBeGreaterThanOrEqual(12)
    first.unmount()
    render(<ScalesMark drawIn />)
    expect(animate.mock.calls.length).toBe(drawn)
  })

  test('every drawn stroke has a path length of 1 and no non-scaling stroke (Safari ignores one with the other)', () => {
    const { container } = render(<ScalesMark />)
    for (const stroke of container.querySelectorAll('[data-part="post"], [data-part="pan"]')) {
      expect(stroke.getAttribute('pathLength')).toBe('1')
    }
    expect(container.querySelector('[vector-effect], [vectorEffect]')).toBeNull()
  })

  test('under reduced motion it is simply there', () => {
    setReducedMotion(true)
    render(<ScalesMark drawIn />)
    expect(animate).not.toHaveBeenCalled()
  })

  test('without drawIn it never animates and leaves the flag alone', () => {
    render(<ScalesMark />)
    expect(animate).not.toHaveBeenCalled()
    expect(sessionStorage.length).toBe(0)
  })
})
