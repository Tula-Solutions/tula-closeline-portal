import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { render } from '@testing-library/react'
import { useRef } from 'react'
import {
  firstTimeThisSession,
  flash,
  play,
  prefersReducedMotion,
  resetFirstTime,
  reveal,
  useCountUp,
  withViewTransition,
} from '~/ui/motion'

const realMatchMedia = window.matchMedia

function setReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
}

function animatable() {
  const element = document.createElement('div')
  const animate = mock(() => ({ finished: Promise.resolve() }) as unknown as Animation)
  Object.assign(element, { animate })
  return { element, animate }
}

type VtDocument = { startViewTransition?: unknown }

afterEach(() => {
  window.matchMedia = realMatchMedia
  delete (document as unknown as VtDocument).startViewTransition
  delete document.documentElement.dataset.transition
})

describe('motion: reduced motion', () => {
  beforeEach(() => setReducedMotion(true))

  test('the setting is read from the media query', () => {
    expect(prefersReducedMotion()).toBe(true)
  })

  test('no Web Animation runs: play, reveal and flash leave elements in their final state', () => {
    const { element, animate } = animatable()
    expect(play(element, [{ opacity: 0 }, { opacity: 1 }], { duration: 100 })).toBeNull()
    reveal([element, element])
    expect(flash(element)).toBeNull()
    expect(animate).not.toHaveBeenCalled()
  })

  test('a view transition is skipped: the update runs directly', () => {
    const start = mock(() => ({ finished: Promise.resolve() }))
    ;(document as unknown as VtDocument).startViewTransition = start
    let ran = false
    withViewTransition(() => {
      ran = true
    }, 'theme')
    expect(ran).toBe(true)
    expect(start).not.toHaveBeenCalled()
    expect(document.documentElement.dataset.transition).toBeUndefined()
  })

  test('a count is written as its final value at once, with no frame loop', () => {
    const raf = mock(() => 0)
    const realRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = raf as unknown as typeof requestAnimationFrame
    function Count() {
      const ref = useRef<HTMLSpanElement>(null)
      useCountUp(ref, 240, (n) => `${n}`)
      return <span ref={ref} data-testid='n' />
    }
    const view = render(<Count />)
    expect(view.getByTestId('n').textContent).toBe('240')
    expect(raf).not.toHaveBeenCalled()
    globalThis.requestAnimationFrame = realRaf
  })
})

describe('motion: full motion', () => {
  beforeEach(() => setReducedMotion(false))

  test('play and reveal use the Web Animations API, staggered and capped', () => {
    const { element, animate } = animatable()
    play(element, [{ opacity: 0 }, { opacity: 1 }], { duration: 100 })
    expect(animate).toHaveBeenCalledTimes(1)
    const rows = Array.from({ length: 12 }, () => animatable())
    reveal(
      rows.map((row) => row.element),
      { step: 10, max: 8 }
    )
    const delays = rows.map(
      (row) =>
        (row.animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions])[1].delay
    )
    expect(delays.slice(0, 3)).toEqual([0, 10, 20])
    expect(delays.at(-1)).toBe(80)
  })

  test('a view transition runs the update and names its kind on <html> until it ends', async () => {
    let finish: () => void = () => {}
    const finished = new Promise<void>((resolve) => {
      finish = resolve
    })
    const start = mock((update: () => void) => {
      update()
      return { finished }
    })
    ;(document as unknown as VtDocument).startViewTransition = start
    let ran = false
    withViewTransition(() => {
      ran = true
    }, 'theme')
    expect(ran).toBe(true)
    expect(start).toHaveBeenCalledTimes(1)
    expect(document.documentElement.dataset.transition).toBe('theme')
    finish()
    await finished
    await Promise.resolve()
    expect(document.documentElement.dataset.transition).toBeUndefined()
  })
})

describe('motion: the once-per-tab flag', () => {
  beforeEach(() => {
    sessionStorage.clear()
    resetFirstTime()
  })

  test('is true once, then false, and stores only a single boolean under one key', () => {
    expect(firstTimeThisSession()).toBe(true)
    expect(firstTimeThisSession()).toBe(false)
    expect(sessionStorage.length).toBe(1)
    const key = sessionStorage.key(0) ?? ''
    expect(key).toBe('closeline.intro-played')
    expect(sessionStorage.getItem(key)).toBe('1')
  })

  test('a reload in the same tab (memory gone, flag kept) does not play it again', () => {
    expect(firstTimeThisSession()).toBe(true)
    resetFirstTime()
    expect(firstTimeThisSession()).toBe(false)
  })
})
