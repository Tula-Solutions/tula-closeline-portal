import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { followSignIn, setThemeChoice, startTheme } from '~/ui/theme'

type Listener = () => void

/** A matchMedia stand-in whose system setting a test can flip. */
function stubSystem(initialDark: boolean) {
  const listeners = new Set<Listener>()
  const state = { dark: initialDark }
  window.matchMedia = (() => ({
    get matches() {
      return state.dark
    },
    addEventListener: (_: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
  })) as unknown as typeof window.matchMedia
  return {
    flip(dark: boolean) {
      state.dark = dark
      for (const listener of listeners) {
        listener()
      }
    },
  }
}

const isDark = () => document.documentElement.classList.contains('dark')

describe('the theme follows sign-in', () => {
  const original = window.matchMedia
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })
  afterEach(() => {
    window.matchMedia = original
    localStorage.clear()
    followSignIn('signed_in')
  })

  test('a signed-out visitor follows the system even when a choice was stored earlier', () => {
    stubSystem(false)
    localStorage.setItem('closeline.theme', 'dark')
    followSignIn('signed_out')
    expect(isDark()).toBe(false)
  })

  test('a signed-in person keeps the stored Appearance choice', () => {
    stubSystem(false)
    localStorage.setItem('closeline.theme', 'dark')
    followSignIn('signed_out')
    followSignIn('signed_in')
    expect(isDark()).toBe(true)
  })

  test('while sign-in is not yet known the theme is left alone', () => {
    stubSystem(true)
    followSignIn('signed_out')
    expect(isDark()).toBe(true)
    localStorage.setItem('closeline.theme', 'light')
    followSignIn('unknown')
    expect(isDark()).toBe(true)
  })

  test('a system change moves a signed-out visitor, and not a signed-in person with a choice', () => {
    const system = stubSystem(false)
    startTheme()
    followSignIn('signed_out')
    system.flip(true)
    expect(isDark()).toBe(true)
    followSignIn('signed_in')
    setThemeChoice('light')
    system.flip(false)
    system.flip(true)
    expect(isDark()).toBe(false)
  })
})
