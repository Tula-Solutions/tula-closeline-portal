import { describe, expect, test } from 'bun:test'
import { EnvError, parseEnv } from '~/env'

const valid = {
  VITE_ENVIRONMENT: 'prod',
  VITE_SENTRY_DSN: 'https://abc123@o1.ingest.sentry.io/42',
  VITE_RELEASE: 'v1.2.3',
}

function problems(raw: Record<string, unknown>): string {
  try {
    parseEnv(raw)
  } catch (error) {
    expect(error).toBeInstanceOf(EnvError)
    return (error as EnvError).message
  }
  throw new Error('parseEnv did not throw')
}

describe('parseEnv', () => {
  test('reads a complete configuration', () => {
    expect(parseEnv(valid)).toEqual({
      environment: 'prod',
      sentryDsn: 'https://abc123@o1.ingest.sentry.io/42',
      release: 'v1.2.3',
      googleFakeIssuerHost: undefined,
    })
  })

  test('the local environment needs no DSN, and an empty DSN means reporting is off', () => {
    const env = parseEnv({
      VITE_ENVIRONMENT: 'local',
      VITE_SENTRY_DSN: '',
    })
    expect(env.sentryDsn).toBeUndefined()
    expect(env.release).toBeUndefined()
  })

  test('a missing VITE_ENVIRONMENT stops the app and names the variable', () => {
    const { VITE_ENVIRONMENT: _removed, ...rest } = valid
    expect(problems(rest)).toContain('VITE_ENVIRONMENT')
  })

  test.each([
    ['VITE_ENVIRONMENT', 'production', 'must be one of local, dev, staging, prod'],
    ['VITE_SENTRY_DSN', 'https://sentry.example/', 'must be a Sentry DSN'],
    ['VITE_SENTRY_DSN', 'http://key@sentry.example/1', 'must be a Sentry DSN'],
  ])('%s = %s is refused', (name, value, message) => {
    const text = problems({ ...valid, [name]: value })
    expect(text).toContain(name)
    expect(text).toContain(message)
  })

  test('outside local a missing DSN is refused', () => {
    const { VITE_SENTRY_DSN: _dsn, ...rest } = valid
    expect(problems(rest)).toContain('VITE_SENTRY_DSN is required outside the local environment')
  })

  test('every problem is listed at once', () => {
    const text = problems({ VITE_ENVIRONMENT: 'production', VITE_SENTRY_DSN: 'nope' })
    expect(text).toContain('VITE_ENVIRONMENT')
    expect(text).toContain('VITE_SENTRY_DSN')
  })

  test('service URLs are no longer settings: the browser calls its own origin', () => {
    const env = parseEnv({
      ...valid,
      VITE_AUTH_BASE_URL: 'https://auth.closeline.example',
      VITE_CORE_BASE_URL: 'https://core.closeline.example',
    })
    expect(JSON.stringify(env)).not.toContain('closeline.example')
  })
})

describe('the fake Google issuer host', () => {
  test('is read in the local environment and refused anywhere else', () => {
    expect(
      parseEnv({ VITE_ENVIRONMENT: 'local', VITE_GOOGLE_FAKE_ISSUER_HOST: '127.0.0.1:3015' })
        .googleFakeIssuerHost
    ).toBe('127.0.0.1:3015')
    expect(parseEnv({ VITE_ENVIRONMENT: 'local' }).googleFakeIssuerHost).toBeUndefined()
    expect(() =>
      parseEnv({
        VITE_ENVIRONMENT: 'prod',
        VITE_SENTRY_DSN: 'https://k@o.ingest.sentry.io/1',
        VITE_GOOGLE_FAKE_ISSUER_HOST: 'evil.example',
      })
    ).toThrow('VITE_GOOGLE_FAKE_ISSUER_HOST')
  })

  test('is lower-cased, because a URL host always is', () => {
    expect(
      parseEnv({ VITE_ENVIRONMENT: 'local', VITE_GOOGLE_FAKE_ISSUER_HOST: 'LocalHost:3015' })
        .googleFakeIssuerHost
    ).toBe('localhost:3015')
  })

  test('must be a host, not a URL', () => {
    expect(() =>
      parseEnv({
        VITE_ENVIRONMENT: 'local',
        VITE_GOOGLE_FAKE_ISSUER_HOST: 'http://127.0.0.1:3015/x',
      })
    ).toThrow('VITE_GOOGLE_FAKE_ISSUER_HOST')
  })
})
