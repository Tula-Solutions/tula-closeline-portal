import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../public/theme-init.js', import.meta.url), 'utf8')
const isDark = () => document.documentElement.classList.contains('dark')

/** Runs the pre-paint script as the browser would, at `path` with the system setting given. */
function run(path: string, systemDark: boolean) {
  window.matchMedia = (() => ({ matches: systemDark })) as unknown as typeof window.matchMedia
  window.history.pushState({}, '', path)
  new Function(source)()
}

describe('public/theme-init.js', () => {
  const original = window.matchMedia
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })
  afterEach(() => {
    window.matchMedia = original
    localStorage.clear()
    window.history.pushState({}, '', '/')
  })

  test('a stored dark choice applies on a signed-in page', () => {
    localStorage.setItem('closeline.theme', 'dark')
    run('/members', false)
    expect(isDark()).toBe(true)
  })

  test('a stale stored dark choice does not flash on a visitor page', () => {
    localStorage.setItem('closeline.theme', 'dark')
    run('/unsubscribe/abc', false)
    expect(isDark()).toBe(false)
  })

  test('a visitor page follows the system setting', () => {
    localStorage.setItem('closeline.theme', 'light')
    run('/sign-in', true)
    expect(isDark()).toBe(true)
  })

  test('every route of the public site and sign-in is a visitor page in the script', () => {
    const root = new URL('../routes/', import.meta.url)
    const names = [
      ...readdirSync(new URL('_site/', root)),
      ...readdirSync(new URL('_public/', root)),
    ]
      .map((file) => file.replace(/\.tsx$/, '').replace(/_\./, '.'))
      .map((name) => `/${name.split('.')[0]}`.replace(/_$/, ''))
    for (const path of new Set(names)) {
      localStorage.setItem('closeline.theme', 'dark')
      document.documentElement.classList.remove('dark')
      run(path, false)
      expect(isDark()).toBe(false)
    }
  })
})
