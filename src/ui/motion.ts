import { type RefObject, useLayoutEffect, useRef } from 'react'

// Motion helpers. Every movement here goes through the Web Animations API or CSS keyframes in the
// stylesheets, never a library that injects <style> (the CSP forbids that). The global
// reduced-motion rule in index.css reaches CSS animations only, so each helper checks the setting
// itself and, under reduced motion, puts things straight into their final state.

/** The motion tokens of index.css, for animations started from script. */
export const EASE = {
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  in: 'cubic-bezier(0.4, 0, 1, 1)',
  move: 'cubic-bezier(0.65, 0, 0.35, 1)',
  expo: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const

/** Durations in milliseconds, matching the --dur-* tokens. */
export const DUR = { press: 80, hover: 120, ui: 180, page: 260, hero: 700 } as const

/** Whether the person asked for less motion (true when the setting cannot be read is not assumed). */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function canAnimate(element: Element | null | undefined): element is Element {
  return (
    element !== null &&
    element !== undefined &&
    typeof (element as Element & { animate?: unknown }).animate === 'function' &&
    !prefersReducedMotion()
  )
}

/**
 * Runs a Web Animation on an element, or nothing under reduced motion (or where the API is
 * missing). The element's own styles are its final state, so skipping leaves it where it belongs.
 */
export function play(
  element: Element | null | undefined,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions
): Animation | null {
  if (!canAnimate(element)) {
    return null
  }
  return element.animate(keyframes, options)
}

/** Brings elements in: a fade and a short rise, one after the other (at most `max` are staggered). */
export function reveal(
  elements: Iterable<Element>,
  options: {
    readonly delay?: number
    readonly step?: number
    readonly max?: number
    readonly rise?: string
    readonly duration?: number
  } = {}
): void {
  const { delay = 0, step = 28, max = 8, rise = '4px', duration = DUR.page } = options
  let index = 0
  for (const element of elements) {
    play(
      element,
      [
        { opacity: 0, transform: `translateY(${rise})` },
        { opacity: 1, transform: 'none' },
      ],
      {
        duration,
        delay: delay + Math.min(index, max) * step,
        easing: EASE.out,
        fill: 'backwards',
      }
    )
    index += 1
  }
}

/** Marks a changed row or value: a cobalt wash that fades out over 1.2 s. */
export function flash(element: Element | null | undefined): Animation | null {
  return play(
    element,
    [
      { backgroundColor: 'color-mix(in oklab, var(--primary) 10%, transparent)' },
      { backgroundColor: 'transparent' },
    ],
    { duration: 1200, easing: EASE.out }
  )
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => { finished: Promise<void> }
}

/**
 * Runs a DOM update inside a view transition when the browser has them and motion is welcome;
 * otherwise runs it directly. `kind` is set on <html> for the transition's length, so the
 * stylesheet can time each kind (a theme change crossfades the whole page).
 */
export function withViewTransition(update: () => void, kind?: string): void {
  const doc = document as ViewTransitionDocument
  if (typeof doc.startViewTransition !== 'function' || prefersReducedMotion()) {
    update()
    return
  }
  const root = document.documentElement
  if (kind) {
    root.dataset.transition = kind
  }
  const transition = doc.startViewTransition(update)
  const done = () => {
    if (kind && root.dataset.transition === kind) {
      delete root.dataset.transition
    }
  }
  // A skipped transition or a throwing update rejects `finished`: clean up either way, never unhandled.
  transition.finished.then(done, done)
}

// The one thing this module keeps in storage: whether the sign-in illustration has already been
// drawn in this tab. It is a single boolean flag under one fixed key, holds nothing about the
// person, and failing to read or write it only means the drawing plays again.
const PLAYED_KEY = 'closeline.intro-played'

let playedInMemory = false

/**
 * True the first time it is asked in a tab, false after that. Where storage is blocked it falls
 * back to memory, so the drawing plays once per page load instead.
 */
export function firstTimeThisSession(): boolean {
  if (playedInMemory) {
    return false
  }
  playedInMemory = true
  try {
    if (sessionStorage.getItem(PLAYED_KEY) === '1') {
      return false
    }
    sessionStorage.setItem(PLAYED_KEY, '1')
  } catch {
    // Blocked storage: memory alone decides.
  }
  return true
}

/** For tests: forgets the in-memory flag (the stored one is cleared by the test itself). */
export function resetFirstTime(): void {
  playedInMemory = false
}

/** Sets CSS custom properties on an element through the DOM (the CSP allows that, not style="..."). */
export function cssVars(vars: Readonly<Record<string, string | number>>) {
  return (element: HTMLElement | SVGElement | null) => {
    if (element === null) {
      return
    }
    for (const [name, value] of Object.entries(vars)) {
      element.style.setProperty(name, String(value))
    }
  }
}

/** Gives an element a view-transition name (for a shared-element move between pages). */
export function transitionName(name: string) {
  return (element: HTMLElement | null) => {
    if (element !== null) {
      element.style.setProperty('view-transition-name', name)
    }
  }
}

/**
 * The view-transition name a Deal's row and its page share, so the Deal id moves from the list to
 * the page heading. Only letters, digits, `-` and `_` survive, so any id makes a valid name.
 */
export function dealTransitionName(id: string): string {
  return `deal-${id.replace(/[^\w-]/g, '_')}`
}

/**
 * Writes a number into an element as it arrives. From nothing, a number of 10 or more counts up
 * over 700 ms (ease-out-expo), and a smaller one rises into place; a later change slides the new
 * value in. It writes `textContent` from requestAnimationFrame, not React state, so nothing
 * re-renders. Under reduced motion the final text is written at once. The caller keeps the
 * animated element hidden from assistive technology and states the final value in text.
 */
export function useCountUp(
  ref: RefObject<HTMLElement | null>,
  value: number | null,
  format: (n: number) => string
): void {
  const shown = useRef<number | null>(null)
  // What a cleanup undid, so the same value run again (StrictMode) animates from where it was.
  const replay = useRef<{ before: number | null; value: number } | null>(null)
  const formatRef = useRef(format)
  formatRef.current = format
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the value changes; the ref and formatter are read fresh
  useLayoutEffect(() => {
    const format = formatRef.current
    const element = ref.current
    if (element === null || value === null) {
      return undefined
    }
    // StrictMode runs this effect, its cleanup, then the effect again with the same value: the
    // cleanup leaves what was shown before, so the second run animates instead of seeing no change.
    const again = replay.current
    replay.current = null
    const before = again !== null && again.value === value ? again.before : shown.current
    shown.current = value
    element.textContent = format(value)
    if (prefersReducedMotion() || before === value) {
      return undefined
    }
    const undo = (animation: Animation | null) => () => {
      animation?.cancel()
      replay.current = { before, value }
    }
    if (before !== null) {
      const slide = play(
        element,
        [
          { transform: 'translateY(100%)', opacity: 0 },
          { transform: 'none', opacity: 1 },
        ],
        {
          duration: DUR.page,
          easing: EASE.out,
        }
      )
      return undo(slide)
    }
    if (value < 10 || typeof requestAnimationFrame !== 'function') {
      const rise = play(
        element,
        [
          { transform: 'translateY(0.35em)', opacity: 0 },
          { transform: 'none', opacity: 1 },
        ],
        {
          duration: 360,
          easing: EASE.out,
          fill: 'backwards',
        }
      )
      return undo(rise)
    }
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DUR.hero)
      const eased = t === 1 ? 1 : 1 - 2 ** (-10 * t)
      element.textContent = format(Math.round(value * eased))
      if (t < 1) {
        frame = requestAnimationFrame(tick)
      }
    }
    element.textContent = format(0)
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      element.textContent = format(value)
      replay.current = { before, value }
    }
  }, [value])
}
