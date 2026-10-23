import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { render } from '@testing-library/react'
import { StrictMode, useRef } from 'react'
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
  const animate = mock(() => ({ finished: Promise.resolve(), cancel() {} }) as unknown as Animation)
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

  test('under StrictMode (effect, cleanup, effect again) a count still counts up from zero', () => {
    const realRaf = globalThis.requestAnimationFrame
    const realCancel = globalThis.cancelAnimationFrame
    const pending = new Map<number, FrameRequestCallback>()
    let next = 0
    globalThis.requestAnimationFrame = (callback) => {
      next += 1
      pending.set(next, callback)
      return next
    }
    globalThis.cancelAnimationFrame = (id) => {
      pending.delete(id)
    }
    function Count() {
      const ref = useRef<HTMLSpanElement>(null)
      useCountUp(ref, 240, (n) => `${n}`)
      return <span ref={ref} data-testid='n' />
    }
    const view = render(
      <StrictMode>
        <Count />
      </StrictMode>
    )
    // The count is under way: it shows 0 and a frame is waiting, rather than jumping to 240.
    expect(view.getByTestId('n').textContent).toBe('0')
    expect(pending.size).toBe(1)
    globalThis.requestAnimationFrame = realRaf
    globalThis.cancelAnimationFrame = realCancel
  })

  test('under StrictMode a small number still rises into place', () => {
    function Count(props: { readonly element: HTMLElement }) {
      const ref = useRef<HTMLElement | null>(props.element)
      useCountUp(ref, 3, (n) => `${n}`)
      return null
    }
    const { element, animate } = animatable()
    render(
      <StrictMode>
        <Count element={element as HTMLElement} />
      </StrictMode>
    )
    expect(animate).toHaveBeenCalled()
    expect(element.textContent).toBe('3')
  })

  test('a skipped transition (its `finished` rejects) is cleaned up and never left unhandled', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    const finished = Promise.reject(new DOMException('Skipped', 'AbortError'))
    ;(document as unknown as VtDocument).startViewTransition = (update: () => void) => {
      update()
      return { finished }
    }
    withViewTransition(() => undefined, 'theme')
    await new Promise((done) => setTimeout(done, 10))
    process.off('unhandledRejection', onUnhandled)
    expect(unhandled).toEqual([])
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
