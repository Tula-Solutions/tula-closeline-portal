import { describe, expect, test } from 'bun:test'
import { createInvitationHolder } from '~/invitation'

const TOKEN = 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5'

function capture(url: string) {
  window.history.replaceState({ keep: 1 }, '', url)
  const holder = createInvitationHolder()
  holder.captureFromLocation(window.location, window.history)
  return holder
}

describe('the Invitation token in the address', () => {
  test('is taken into memory and removed from the address bar at once', () => {
    const holder = capture(`/sign-up#invitation=${TOKEN}`)
    expect(holder.current()).toEqual({ status: 'present', token: TOKEN })
    expect(window.location.hash).toBe('')
    expect(window.location.href).not.toContain(TOKEN)
    expect(window.history.state).toEqual({ keep: 1 })
  })

  test('leaves the path and query, and other fragment parameters, alone', () => {
    capture(`/sign-up?from=email#utm=a&invitation=${TOKEN}`)
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      '/sign-up?from=email#utm=a'
    )
  })

  test('is never written to storage', () => {
    capture(`/sign-up#invitation=${TOKEN}`)
    expect(localStorage.length + sessionStorage.length).toBe(0)
  })

  test.each(['short', 'has spaces in it that no token has', 'x'.repeat(300), ''])(
    'a token that cannot be a token (%p) is malformed, and is still removed',
    (raw) => {
      const holder = capture(`/sign-up#invitation=${encodeURIComponent(raw)}`)
      expect(holder.current()).toEqual({ status: 'malformed' })
      expect(window.location.hash).toBe('')
    }
  )

  test('an address without one changes nothing', () => {
    const holder = capture('/sign-up#other=1')
    expect(holder.current()).toEqual({ status: 'none' })
    expect(window.location.hash).toBe('#other=1')
  })

  test('can be forgotten', () => {
    const holder = capture(`/sign-up#invitation=${TOKEN}`)
    holder.clear()
    expect(holder.current()).toEqual({ status: 'none' })
  })
})

describe('a crafted address', () => {
  test('a path with leading slashes cannot make replaceState throw with the token left in the bar', () => {
    const replaced: string[] = []
    const holder = createInvitationHolder()
    holder.captureFromLocation(
      { pathname: '//x.test/p', search: '?a=1', hash: `#invitation=${TOKEN}` },
      {
        state: null,
        replaceState(_state, _title, url) {
          // What a browser does: `//host/...` resolves as another origin and throws.
          if (String(url).startsWith('//')) {
            throw new DOMException('cross-origin', 'SecurityError')
          }
          replaced.push(String(url))
        },
      }
    )
    expect(replaced).toEqual(['/x.test/p?a=1'])
    expect(holder.current()).toEqual({ status: 'present', token: TOKEN })
  })
})

describe('revealTo', () => {
  test('hands the held token to the sink, and nothing when none is held', () => {
    const seen: string[] = []
    expect(createInvitationHolder().revealTo((token) => seen.push(token))).toBeUndefined()
    expect(seen).toEqual([])
    capture(`/sign-up#invitation=${TOKEN}`).revealTo((token) => seen.push(token))
    expect(seen).toEqual([TOKEN])
  })

  test('hands nothing over for a malformed token', () => {
    const seen: string[] = []
    capture('/sign-up#invitation=short').revealTo((token) => seen.push(token))
    expect(seen).toEqual([])
  })
})
