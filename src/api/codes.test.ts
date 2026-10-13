import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'
import { AUTH_ERRORS, ERRORS } from 'tula-closeline-contract'
import { HANDLED_CODES } from '~/api/messages'

const AREAS = [
  'auth',
  'email',
  'password',
  'verification',
  'flow',
  'session',
  'signup',
  'mail',
  'membership',
  'organization',
]
const CODE_LITERAL = new RegExp(`(['"\`])((?:${AREAS.join('|')})\\.[a-z_]+)\\1`, 'g')
const FROM_A_MAP = /\b(?:AUTH_|CORE_|SIGNUP_)?ERRORS\[\s*$/

/** The auth-area `area.reason` literals in `source` that are not an index into a contract map. */
function strayCodes(source: string): string[] {
  const stray: string[] = []
  for (const match of source.matchAll(CODE_LITERAL)) {
    if (!FROM_A_MAP.test(source.slice(0, match.index))) {
      stray.push(match[2] as string)
    }
  }
  return stray
}

describe('the detector', () => {
  test.each([
    ["const a = 'auth.invalid_credentials'", ['auth.invalid_credentials']],
    ['case "session.expired":', ['session.expired']],
    ['const a = `mail.unavailable`', ['mail.unavailable']],
    ["const a = AUTH_ERRORS['auth.invalid_credentials'].code", []],
    ["const a = ERRORS[ 'auth.token_expired' ].code", []],
    ["const a = OTHER['auth.token_expired']", ['auth.token_expired']],
    ["const a = 'client.timeout'", []],
    ["const a = 'a.password.too_short'", []],
  ] as const)('%s', (source, expected) => {
    expect(strayCodes(source)).toEqual([...expected])
  })
})

describe('the portal source', () => {
  test('takes every auth error code from a contract map, never a string literal', async () => {
    const files = [...new Glob('src/**/*.{ts,tsx}').scanSync('.')].filter(
      (path) => !/\.(test|gen)\.tsx?$/.test(path)
    )
    expect(files.length).toBeGreaterThan(10)
    const found: Record<string, string[]> = {}
    for (const path of files) {
      const stray = strayCodes(await Bun.file(path).text())
      if (stray.length > 0) {
        found[path] = stray
      }
    }
    expect(found).toEqual({})
  })

  test('only handles codes the contract defines', () => {
    const known = new Set<string>([...Object.keys(AUTH_ERRORS), ...Object.keys(ERRORS)])
    const unknown = HANDLED_CODES.filter((code) => !code.startsWith('client.') && !known.has(code))
    expect(unknown).toEqual([])
  })
})
