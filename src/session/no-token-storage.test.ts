import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = new URL('..', import.meta.url).pathname

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) {
      return sources(path)
    }
    return /\.(ts|tsx)$/.test(name) &&
      !/\.(test|gen)\.tsx?$/.test(name) &&
      !path.includes('/testing/')
      ? [path]
      : []
  })
}

/** Comments are prose; the rules are about code. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const files = sources(SRC).map((path) => ({
  path: path.slice(SRC.length),
  text: code(readFileSync(path, 'utf8')),
}))

// These scans are a tripwire, not a proof. They read source text, so they catch the obvious
// regression (a storage call, a console line or a report that names a token) and nothing cleverer:
// an aliased `const s = window['local' + 'Storage']` would pass. Review and the behaviour tests in
// session.test.ts carry the real guarantee.
describe('the tokens live in memory only', () => {
  test('there is source to scan', () => {
    expect(files.length).toBeGreaterThan(20)
    expect(files.some((file) => file.path === 'session/session.ts')).toBe(true)
  })

  test.each([
    ['localStorage', /\blocalStorage\b/],
    ['sessionStorage', /\bsessionStorage\b/],
    ['IndexedDB', /\bindexedDB\b|\bIDBFactory\b/],
    ['document.cookie', /document\s*\.\s*cookie|cookieStore/],
    ['the Cache API', /\bcaches\s*\.|\bCacheStorage\b/],
    ['history state', /history\.(replaceState|pushState)\([^)]*(token|Token)/],
  ])('no portal source uses %s', (_name, pattern) => {
    // The one exception: the theme choice (light, dark or system) is kept in localStorage by
    // ui/theme.ts, which holds nothing else (the next test checks that it names no token).
    const used = files
      .filter((file) => pattern.test(file.text))
      .filter((file) => !(_name === 'localStorage' && file.path === 'ui/theme.ts'))
      // The second: ui/motion.ts keeps one boolean in sessionStorage (the sign-in drawing has played).
      .filter((file) => !(_name === 'sessionStorage' && file.path === 'ui/motion.ts'))
      .map((file) => file.path)
    expect(used).toEqual([])
  })

  test('the theme module keeps only the theme choice', () => {
    const theme = files.find((file) => file.path === 'ui/theme.ts')?.text ?? ''
    expect(theme).toMatch(/localStorage/)
    expect(theme).not.toMatch(/token|session|password|email/i)
  })

  test('the motion module keeps one boolean under one fixed key, and nothing about the person', () => {
    const motion = files.find((file) => file.path === 'ui/motion.ts')?.text ?? ''
    const writes = [...motion.matchAll(/sessionStorage\.setItem\(([^)]*)\)/g)].map(
      (call) => call[1]
    )
    expect(writes).toEqual(["PLAYED_KEY, '1'"])
    expect(motion).toMatch(/const PLAYED_KEY = 'closeline\.intro-played'/)
    expect(motion).not.toMatch(/localStorage|[tT]oken|password|email|organization/i)
  })

  test('the refresh token appears nowhere in portal code', () => {
    const named = files
      .filter((file) => /refresh[_-]?token|refreshToken/i.test(file.text))
      .map((file) => file.path)
    expect(named).toEqual([])
  })

  test('the access token is named only by the session (which holds it) and the HTTP client (which sends it)', () => {
    const holders = files
      .filter((file) => /\baccessToken\b/.test(file.text))
      .map((file) => file.path)
      .sort()
    expect(holders).toEqual(['api/http.ts', 'session/session.ts'])
  })

  test('the access token is not serialised: no JSON.stringify of the session or its tokens', () => {
    const session = files.find((file) => file.path === 'session/session.ts')?.text ?? ''
    expect(session).not.toMatch(/JSON\.stringify|structuredClone/)
    expect(session).not.toMatch(/postMessage\([^)]*(accessToken|tokens)/)
  })

  test('no source writes to the console', () => {
    const used = files.filter((file) => /\bconsole\s*\./.test(file.text)).map((file) => file.path)
    expect(used).toEqual([])
  })

  test('the HTTP client and the session never hand a token to the reporter', () => {
    for (const path of ['api/http.ts', 'session/session.ts']) {
      const text = files.find((file) => file.path === path)?.text ?? ''
      expect([path, /~\/report\//.test(text)]).toEqual([path, false])
      expect([path, /\b(report|reporter|capture)\w*\s*[.(][^;\n]*[tT]oken/.test(text)]).toEqual([
        path,
        false,
      ])
    }
  })

  test('the one report the session triggers carries status and code only', () => {
    const app = files.find((file) => file.path === 'app.ts')?.text ?? ''
    const call = app.match(/reporter\.report\(new Error\(([^)]*)\)\)/)?.[1] ?? ''
    expect(call).toContain('error.status')
    expect(call).toContain('error.code')
    expect(call).not.toMatch(/[tT]oken|message/)
  })
})
