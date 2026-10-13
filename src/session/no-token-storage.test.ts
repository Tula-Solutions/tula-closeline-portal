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
    const used = files.filter((file) => pattern.test(file.text)).map((file) => file.path)
    expect(used).toEqual([])
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
})
