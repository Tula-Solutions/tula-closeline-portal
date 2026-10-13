import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createApp } from '~/app'
import { noopReporter } from '~/report/reporter'
import { fakeFetch, json, route, TEST_ENV, tokens } from '~/testing/fixtures'
import { organizationBody } from '~/testing/render'
import { createHttpClient } from './http'

describe('every browser call is same-origin', () => {
  async function everyKindOfCall() {
    const double = fakeFetch(
      route('GET', '/v1/client/password-policy', json(200, { minLength: 10, maxLength: 128 })),
      route(
        'POST',
        '/v1/client/sign-ins',
        json(200, { id: 'a', kind: 'sign_in', expiresAt: 'x', step: { status: 'needs_password' } })
      ),
      route('POST', '/v1/client/sessions/refresh', json(200, tokens({ accessToken: 'access-2' }))),
      route('POST', '/v1/client/sessions/sign-out', new Response(null, { status: 204 })),
      route('GET', '/v1/organization', json(200, organizationBody()))
    )
    const app = createApp({
      env: TEST_ENV,
      reporter: noopReporter,
      fetch: double.fetch,
      sleep: async () => {},
    })
    await app.auth.passwordPolicy()
    await app.auth.startSignIn('maya@northline.app')
    await app.session.restore()
    await app.core.getOrganization()
    await app.session.signOut()
    return double.calls
  }

  test('no request URL is absolute: each is a path starting with one slash', async () => {
    const calls = await everyKindOfCall()
    expect(calls.length).toBe(5)
    for (const call of calls) {
      expect(call.url).toMatch(/^\/[^/]/)
      expect(call.url).not.toMatch(/^[a-z][a-z0-9+.-]*:/i)
    }
  })

  test('every request is sent with same-origin credentials, never include or omit', async () => {
    for (const call of await everyKindOfCall()) {
      expect(call.init.credentials).toBe('same-origin')
    }
  })

  test('every call to auth declares the browser client type; core calls do not need to', async () => {
    const calls = await everyKindOfCall()
    const toAuth = calls.filter((call) => call.path.startsWith('/v1/client/'))
    expect(toAuth.length).toBe(4)
    for (const call of toAuth) {
      expect(call.headers.get('x-tula-client')).toBe('browser')
    }
  })

  test('the refresh and sign-out requests carry no body and no token header', async () => {
    const calls = await everyKindOfCall()
    for (const path of ['/v1/client/sessions/refresh', '/v1/client/sessions/sign-out']) {
      const call = calls.find((candidate) => candidate.path === path)
      expect(call?.init.body).toBeUndefined()
      expect(call?.headers.get('authorization')).toBeNull()
    }
  })

  test.each(['https://evil.test/v1/x', '//evil.test/v1/x', 'v1/x', ''])(
    'the HTTP client refuses the path %p',
    async (path) => {
      const double = fakeFetch()
      const http = createHttpClient({ fetch: double.fetch })
      await expect(http.request({ path })).rejects.toThrow('single slash')
      expect(double.calls).toEqual([])
    }
  )

  test('no service URL is configured or written into the portal source', () => {
    const root = new URL('..', import.meta.url).pathname
    const read = (directory: string): string[] =>
      readdirSync(directory).flatMap((name) => {
        const path = join(directory, name)
        if (statSync(path).isDirectory()) {
          return read(path)
        }
        return /\.(ts|tsx)$/.test(name) && !/\.(test|gen)\.tsx?$/.test(name) ? [path] : []
      })
    const offenders = read(root).filter((path) => {
      const text = readFileSync(path, 'utf8')
      return /BASE_URL|localhost:300\d|127\.0\.0\.1:300\d/.test(text)
    })
    // The dev proxy defaults live in service-routes.ts, which only the dev server's config imports.
    expect(offenders.map((path) => path.slice(root.length))).toEqual(['api/service-routes.ts'])
  })
})
