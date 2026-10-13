import { describe, expect, test } from 'bun:test'
import { EnvError, parseEnv } from '~/env'

const valid = {
  VITE_ENVIRONMENT: 'prod',
  VITE_AUTH_BASE_URL: 'https://auth.closeline.example/',
  VITE_CORE_BASE_URL: 'https://core.closeline.example',
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
  test('reads a complete configuration and drops a trailing slash', () => {
    expect(parseEnv(valid)).toEqual({
      environment: 'prod',
      authBaseUrl: 'https://auth.closeline.example',
      coreBaseUrl: 'https://core.closeline.example',
      sentryDsn: 'https://abc123@o1.ingest.sentry.io/42',
      release: 'v1.2.3',
    })
  })

  test('the local environment needs no DSN, and an empty DSN means reporting is off', () => {
    const env = parseEnv({
      VITE_ENVIRONMENT: 'local',
      VITE_AUTH_BASE_URL: 'http://localhost:3001',
      VITE_CORE_BASE_URL: 'http://localhost:3002',
      VITE_SENTRY_DSN: '',
    })
    expect(env.sentryDsn).toBeUndefined()
    expect(env.release).toBeUndefined()
  })

  test.each(['VITE_ENVIRONMENT', 'VITE_AUTH_BASE_URL', 'VITE_CORE_BASE_URL'])(
    'a missing %s stops the app and names the variable',
    (name) => {
      const { [name]: _removed, ...rest } = valid as Record<string, string>
      expect(problems(rest)).toContain(name)
    }
  )

  test.each([
    ['VITE_ENVIRONMENT', 'production', 'must be one of local, dev, staging, prod'],
    ['VITE_AUTH_BASE_URL', 'not a url', 'must be an http(s) URL'],
    ['VITE_CORE_BASE_URL', 'ftp://core.example', 'must be an http(s) URL'],
    ['VITE_AUTH_BASE_URL', 'https://auth.example/?a=1', 'must be an http(s) URL'],
    ['VITE_AUTH_BASE_URL', 'http://auth.example', 'must use https outside the local environment'],
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
    const text = problems({})
    expect(text).toContain('VITE_ENVIRONMENT')
    expect(text).toContain('VITE_AUTH_BASE_URL')
    expect(text).toContain('VITE_CORE_BASE_URL')
  })

  test.each([
    ['VITE_AUTH_BASE_URL', 'https://user:secret@auth.closeline.example'],
    ['VITE_CORE_BASE_URL', 'https://user@core.closeline.example'],
    ['VITE_AUTH_BASE_URL', 'https://:secret@auth.closeline.example'],
  ])('%s with a username or password (%s) is refused, without echoing it', (name, value) => {
    const message = problems({ ...valid, [name]: value })
    expect(message).toContain(name)
    expect(message).toContain('credentials')
    expect(message).not.toContain('secret')
  })
})
