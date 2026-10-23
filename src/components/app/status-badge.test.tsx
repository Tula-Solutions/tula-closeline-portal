import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { render } from '@testing-library/react'
import { StatusBadge } from '~/components/app/status-badge'

const realMatchMedia = window.matchMedia
const realAnimate = HTMLElement.prototype.animate
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
  animate = mock(() => ({}) as Animation)
  HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate
  setReducedMotion(false)
})

afterEach(() => {
  HTMLElement.prototype.animate = realAnimate
  window.matchMedia = realMatchMedia
})

const dot = (container: HTMLElement) =>
  container.querySelector('[data-slot="status-dot"]') as HTMLElement

describe('the status dot', () => {
  test('breathes while work is under way, and stops when it is done', () => {
    const { container, rerender } = render(<StatusBadge state='processing'>Processing</StatusBadge>)
    expect(dot(container).classList.contains('status-busy')).toBe(true)
    rerender(<StatusBadge state='ready'>Ready</StatusBadge>)
    expect(dot(container).classList.contains('status-busy')).toBe(false)
  })

  test('a ring pulses once when a shown state turns ready, not when it first appears ready', () => {
    const { rerender } = render(<StatusBadge state='ready'>Ready</StatusBadge>)
    expect(animate).not.toHaveBeenCalled()
    rerender(<StatusBadge state='processing'>Processing</StatusBadge>)
    expect(animate).not.toHaveBeenCalled()
    rerender(<StatusBadge state='ready'>Ready</StatusBadge>)
    expect(animate).toHaveBeenCalledTimes(1)
  })

  test('under reduced motion a state turning ready only changes colour', () => {
    setReducedMotion(true)
    const { rerender } = render(<StatusBadge state='processing'>Processing</StatusBadge>)
    rerender(<StatusBadge state='ready'>Ready</StatusBadge>)
    expect(animate).not.toHaveBeenCalled()
  })
})
