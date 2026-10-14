import { describe, expect, test } from 'bun:test'

const script = await Bun.file(new URL('../../public/theme-init.js', import.meta.url)).text()

function run(stored: string | null, systemDark: boolean): boolean {
  const classes = new Set<string>()
  const root = {
    classList: {
      toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)),
    },
  }
  new Function('localStorage', 'matchMedia', 'document', script)(
    { getItem: () => stored },
    () => ({ matches: systemDark }),
    { documentElement: root }
  )
  return classes.has('dark')
}

describe('the theme script that runs before the first paint', () => {
  test('follows the system when nothing is stored, and obeys a stored choice', () => {
    expect(run(null, true)).toBe(true)
    expect(run(null, false)).toBe(false)
    expect(run('dark', false)).toBe(true)
    expect(run('light', true)).toBe(false)
  })

  test('does not throw when storage is blocked', () => {
    const classes = new Set<string>()
    const root = {
      classList: { toggle: (n: string, on: boolean) => (on ? classes.add(n) : classes.delete(n)) },
    }
    const blocked = {
      get getItem(): never {
        throw new Error('blocked')
      },
    }
    new Function('localStorage', 'matchMedia', 'document', script)(
      blocked,
      () => ({ matches: true }),
      { documentElement: root }
    )
    expect(classes.has('dark')).toBe(true)
  })
})
