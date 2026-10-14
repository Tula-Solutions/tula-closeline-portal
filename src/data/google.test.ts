import { describe, expect, test } from 'bun:test'
import { allowedAuthorizationUrl } from '~/data/google'

describe('the authorization URL allow-list', () => {
  test.each(['https://accounts.google.com/o/oauth2/v2/auth?client_id=x&state=y'])(
    'accepts %s',
    (url) => {
      expect(allowedAuthorizationUrl(url, undefined)?.hostname).toBe('accounts.google.com')
    }
  )

  test.each([
    'https://accounts.google.com.evil.example/o/oauth2/v2/auth',
    'https://evil.example/?next=accounts.google.com',
    'https://accounts.google.com@evil.example/',
    'http://accounts.google.com/o/oauth2/v2/auth',
    'javascript:alert(1)',
    'data:text/html,hi',
    '//accounts.google.com/x',
    '/relative',
    'https://user:pass@accounts.google.com/x',
    ' https://accounts.google.com/x',
    'http://127.0.0.1:3015/authorize',
  ])('refuses %s when no fake issuer is configured', (url) => {
    expect(allowedAuthorizationUrl(url, undefined)).toBeNull()
  })

  test('the fake issuer must be plain http', () => {
    expect(allowedAuthorizationUrl('https://127.0.0.1:3015/authorize', '127.0.0.1:3015')).toBeNull()
  })

  test('accepts the configured fake issuer host and port only', () => {
    expect(
      allowedAuthorizationUrl('http://127.0.0.1:3015/authorize?x=1', '127.0.0.1:3015')
    ).not.toBeNull()
    expect(allowedAuthorizationUrl('http://127.0.0.1:3016/authorize', '127.0.0.1:3015')).toBeNull()
    expect(
      allowedAuthorizationUrl('http://127.0.0.1.evil.example:3015/', '127.0.0.1:3015')
    ).toBeNull()
  })
})
