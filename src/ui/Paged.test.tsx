import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { render } from '@testing-library/react'
import { Paged, type PagedState } from '~/ui/Paged'

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

function state(over: Partial<PagedState>): PagedState {
  return {
    isPending: false,
    isError: false,
    error: null,
    hasData: true,
    isEmpty: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: () => undefined,
    refetch: () => undefined,
    ...over,
  }
}

function list(s: PagedState, rows: number) {
  return (
    <Paged noun='Deals' emptyText='None.' state={s}>
      <table>
        <tbody>
          {Array.from({ length: rows }, (_, row) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed test rows
            <tr key={row}>
              <td>Row {row}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Paged>
  )
}

describe('a paged list', () => {
  test('rows arrive one after another the first time the list loads, at most 8 steps apart', () => {
    const { rerender } = render(list(state({ isPending: true, hasData: false }), 0))
    rerender(list(state({}), 12))
    expect(animate).toHaveBeenCalledTimes(12)
    const delays = animate.mock.calls.map(
      (call) => (call as unknown as [Keyframe[], KeyframeAnimationOptions])[1].delay
    )
    expect(delays.slice(0, 3)).toEqual([0, 28, 56])
    expect(delays[11]).toBe(8 * 28)
  })

  test('a list already in the cache, a refetch and Load more put rows in place without motion', () => {
    const { rerender } = render(list(state({}), 3))
    rerender(list(state({}), 6))
    expect(animate).not.toHaveBeenCalled()
  })

  test('under reduced motion rows are simply there', () => {
    setReducedMotion(true)
    const { rerender } = render(list(state({ isPending: true, hasData: false }), 0))
    rerender(list(state({}), 4))
    expect(animate).not.toHaveBeenCalled()
  })
})
