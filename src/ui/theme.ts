import { useSyncExternalStore } from 'react'

/** What the person chose: a fixed theme, or whatever the system says. */
export type ThemeChoice = 'light' | 'dark' | 'system'

const KEY = 'closeline.theme'
const listeners = new Set<() => void>()

/** Whose preference rules: the stored Appearance choice, or the system (a signed-out visitor). */
let rule: 'stored' | 'system' = 'stored'

/** The choice that applies now: a signed-out visitor has no Appearance setting, so follows the system. */
function effectiveChoice(): ThemeChoice {
  return rule === 'system' ? 'system' : readThemeChoice()
}

/** Reads the stored choice, `system` when there is none or storage is blocked. */
export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

/** Puts the `dark` class on <html> as the choice (and, for `system`, the system setting) says. */
export function applyTheme(choice: ThemeChoice): void {
  const dark =
    choice === 'dark' ||
    (choice === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true)
  document.documentElement.classList.toggle('dark', dark)
}

/** Stores a choice and applies it. */
export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === 'system') {
      localStorage.removeItem(KEY)
    } else {
      localStorage.setItem(KEY, choice)
    }
  } catch {
    // Storage may be blocked: the choice then lasts for this page only.
  }
  applyTheme(choice)
  for (const listener of listeners) {
    listener()
  }
}

/**
 * Makes the theme follow who is here: a signed-out visitor sees the system setting, a signed-in
 * person the Appearance choice they stored. While that is not yet known nothing changes.
 */
export function followSignIn(state: 'signed_out' | 'signed_in' | 'unknown'): void {
  if (state === 'unknown') {
    return
  }
  rule = state === 'signed_out' ? 'system' : 'stored'
  applyTheme(effectiveChoice())
}

/** Applies the stored choice now, and again when the system setting changes while it is `system`. */
export function startTheme(): void {
  applyTheme(effectiveChoice())
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (effectiveChoice() === 'system') {
      applyTheme('system')
    }
  })
}

/** The current choice, kept in step with `setThemeChoice`. */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    readThemeChoice,
    () => 'system'
  )
}
