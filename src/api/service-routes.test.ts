import { describe, expect, test } from 'bun:test'
import authSpec from '../../openapi/auth.openapi.json'
import coreSpec from '../../openapi/core.openapi.json'
import playbookSpec from '../../openapi/playbook.openapi.json'
import voiceSpec from '../../openapi/voice.openapi.json'
import {
  devProxy,
  NOT_ROUTED_FROM_BROWSER,
  parseProxyTargets,
  SERVICE_ROUTES,
  serviceFor,
} from './service-routes'

/** Core's paths, from the vendored copy of its OpenAPI document (`bun run generate:api -- --core-from ...`). */
const CORE_PATHS = Object.keys(coreSpec.paths)
const AUTH_PATHS = Object.keys(authSpec.paths)
const PLAYBOOK_PATHS = Object.keys(playbookSpec.paths)
const VOICE_PATHS = Object.keys(voiceSpec.paths)

/** A concrete request path for an OpenAPI path template. */
const concrete = (path: string) => path.replace(/\{[^}]+\}/g, 'x1')

describe('the routing table', () => {
  test('lists the prefixes, each for exactly one service', () => {
    expect(SERVICE_ROUTES.map((route) => `${route.prefix} -> ${route.service}`)).toEqual([
      '/v1/client -> auth',
      '/v1/token -> auth',
      '/v1/organization -> core',
      '/v1/members -> core',
      '/v1/invitations -> core',
      '/v1/teams -> core',
      '/v1/marketing -> core',
      '/v1/prospects -> core',
      '/v1/prospect-companies -> core',
      '/v1/prospect-imports -> core',
      '/v1/suppression-entries -> core',
      '/v1/contact-checks -> core',
      '/v1/consent-wordings -> core',
      '/v1/consent-forms -> core',
      '/v1/public -> core',
      '/v1/crm -> core',
      '/v1/api-keys -> core',
      '/v1/conversations -> core',
      '/v1/approvals -> core',
      '/v1/drafts -> core',
      '/v1/decisions -> core',
      '/v1/approval-policies -> core',
      '/v1/escalation-rules -> core',
      '/v1/agent-instructions -> core',
      '/v1/audit-events -> core',
      '/v1/audit-csv -> core',
      '/v1/exports -> core',
      '/v1/audit-verification -> core',
      '/v1/analytics -> core',
      '/v1/agent-controls -> core',
      '/v1/assessments -> core',
      '/v1/calendar-connection -> core',
      '/v1/availability -> core',
      '/v1/booking-types -> core',
      '/v1/booking-slots -> core',
      '/v1/bookings -> core',
      '/v1/routing-rules -> core',
      '/v1/assessment-rates -> core',
      '/v1/playbook -> playbook',
      '/v1/lines -> voice',
      '/v1/agent -> voice',
      '/v1/calls -> voice',
      '/v1/softphone -> voice',
      '/v1/handoffs -> voice',
      '/v1/enrichment -> outbound',
      '/v1/enrichment-runs -> outbound',
      '/v1/enrichment-run-sets -> outbound',
      '/v1/signals -> outbound',
      '/v1/signal-settings -> outbound',
      '/v1/signal-webhook -> outbound',
      '/v1/fit-criteria -> outbound',
      '/v1/fit-scores -> outbound',
    ])
    expect(new Set(SERVICE_ROUTES.map((route) => route.prefix)).size).toBe(SERVICE_ROUTES.length)
  })

  test.each(
    AUTH_PATHS.filter((path) => !NOT_ROUTED_FROM_BROWSER.includes(path)).map((path) => [path])
  )('auth path %s maps to auth', (path) => {
    expect(serviceFor(concrete(path as string))).toBe('auth')
  })

  test.each(
    CORE_PATHS.filter((path) => !NOT_ROUTED_FROM_BROWSER.includes(path))
      .filter((path) => !path.startsWith('/internal'))
      .map((path) => [path])
  )('core path %s maps to core', (path) => {
    expect(serviceFor(concrete(path as string))).toBe('core')
  })

  test.each(
    PLAYBOOK_PATHS.filter((path) => !NOT_ROUTED_FROM_BROWSER.includes(path))
      .filter((path) => !path.startsWith('/internal'))
      .map((path) => [path])
  )('playbook path %s maps to playbook', (path) => {
    expect(serviceFor(concrete(path as string))).toBe('playbook')
  })

  test.each(
    VOICE_PATHS.filter((path) => !NOT_ROUTED_FROM_BROWSER.includes(path))
      .filter((path) => !path.startsWith('/internal'))
      .map((path) => [path])
  )('voice path %s maps to voice', (path) => {
    expect(serviceFor(concrete(path as string))).toBe('voice')
  })

  test('every path of the four services is routed to exactly one service, or listed as not routed', () => {
    const everything = [...AUTH_PATHS, ...CORE_PATHS, ...PLAYBOOK_PATHS, ...VOICE_PATHS].filter(
      (path) => !path.startsWith('/internal')
    )
    for (const path of everything) {
      const hits = SERVICE_ROUTES.filter(
        (route) => concrete(path) === route.prefix || concrete(path).startsWith(`${route.prefix}/`)
      )
      if (NOT_ROUTED_FROM_BROWSER.includes(path)) {
        expect([path, hits.length]).toEqual([path, 0])
      } else {
        expect([path, hits.length]).toEqual([path, 1])
      }
    }
  })

  test('the only paths the services share are the health probes, which are not routed', () => {
    const shared = AUTH_PATHS.filter((path) => CORE_PATHS.includes(path)).sort()
    expect(PLAYBOOK_PATHS.filter((path) => shared.includes(path)).sort()).toEqual(shared)
    expect(VOICE_PATHS.filter((path) => shared.includes(path)).sort()).toEqual(shared)
    expect(shared).toEqual(['/healthz', '/readyz'])
    for (const path of shared) {
      expect(serviceFor(path)).toBeNull()
    }
  })

  test.each([
    '/internal/organizations',
    '/internal/organizations/{organizationId}/abandon',
    '/internal/invitations/accept',
    '/internal/membership',
    '/internal',
    '/internal/anything/else',
    '/v1/internal',
    '/v1/client/../internal/membership',
  ])('%s maps to no service', (path) => {
    expect(serviceFor(path)).toBeNull()
  })

  test.each([
    ['/v1/clients', null],
    ['/v1/organizations', null],
    ['/v1/client', 'auth'],
    ['/v1/client/sessions/refresh', 'auth'],
    ['/v1/teams/t1/members', 'core'],
    ['/v1/playbook/documents', 'playbook'],
    ['/v1/lines', 'voice'],
    ['/v1/lines/line_1/release', 'voice'],
    ['/v1/linesx', null],
    ['/v1/enrichment-runs', 'outbound'],
    ['/v1/enrichment/budget', 'outbound'],
    ['/v1/fit-criteria/fcr_1', 'outbound'],
    ['/v1/prospects/prs_1/enrichment', 'outbound'],
    ['/v1/prospects/prs_1/signals', 'outbound'],
    ['/v1/prospects/prs_1/fit', 'outbound'],
    ['/v1/prospects/prs_1', 'core'],
    ['/v1/prospects/prs_1/consent', 'core'],
    ['/v1/prospects/prs_1/fit/x', 'core'],
    ['/v1/marketing/demo-requests', 'core'],
    ['/v1/playbooks', null],
    ['/', null],
    ['/sign-in', null],
  ])('%s is matched on a path-segment boundary: %s', (path, service) => {
    expect(serviceFor(path)).toBe(
      service as 'auth' | 'core' | 'playbook' | 'voice' | 'outbound' | null
    )
  })

  test("the refresh cookie's Path is under the auth prefix, so the browser's request reaches auth unchanged", () => {
    expect(serviceFor('/v1/client/sessions/refresh')).toBe('auth')
    expect(serviceFor('/v1/client/sessions/sign-out')).toBe('auth')
    expect('/v1/client/sessions/refresh'.startsWith('/v1/client/sessions/')).toBe(true)
  })
})

describe('the dev proxy', () => {
  test("sends a Prospect's enrichment, signals and fit to outbound, and the rest of /v1/prospects to core", () => {
    const proxy = devProxy({
      auth: 'a',
      core: 'http://core',
      playbook: 'p',
      voice: 'v',
      outbound: 'http://outbound',
    })
    const first = (path: string) =>
      Object.entries(proxy).find(([pattern]) => new RegExp(pattern).test(path))?.[1].target
    expect(first('/v1/prospects/prs_1/enrichment?x=1')).toBe('http://outbound')
    expect(first('/v1/prospects/prs_1/signals')).toBe('http://outbound')
    expect(first('/v1/prospects/prs_1/consent')).toBe('http://core')
    expect(first('/v1/prospects/prs_1')).toBe('http://core')
  })

  const proxy = devProxy({
    auth: 'http://127.0.0.1:3001',
    core: 'http://127.0.0.1:3002',
    playbook: 'http://127.0.0.1:3003',
    voice: 'http://127.0.0.1:3004',
    outbound: 'http://127.0.0.1:3005',
  })
  const matching = (path: string) =>
    Object.entries(proxy).filter(([pattern]) => new RegExp(pattern).test(path))

  test('has one entry per prefix, none rewriting or stripping the path', () => {
    expect(Object.keys(proxy)).toHaveLength(SERVICE_ROUTES.length + 1)
    for (const entry of Object.values(proxy)) {
      expect(Object.keys(entry).sort()).toEqual(['changeOrigin', 'target'])
    }
  })

  test('sends each path to the service the table names, and nothing to /internal', () => {
    for (const path of [...AUTH_PATHS, ...CORE_PATHS, ...PLAYBOOK_PATHS, ...VOICE_PATHS]) {
      const hits = matching(concrete(path))
      const service = serviceFor(concrete(path))
      if (service === null) {
        expect([path, hits.length]).toEqual([path, 0])
      } else {
        expect([path, hits.map(([, entry]) => entry.target)]).toEqual([
          path,
          [
            {
              auth: 'http://127.0.0.1:3001',
              core: 'http://127.0.0.1:3002',
              playbook: 'http://127.0.0.1:3003',
              voice: 'http://127.0.0.1:3004',
              outbound: 'http://127.0.0.1:3005',
            }[service],
          ],
        ])
      }
    }
  })

  test('matches a path with a query string, and not a longer word', () => {
    expect(matching('/v1/organization?x=1')).toHaveLength(1)
    expect(matching('/v1/organizations')).toHaveLength(0)
    expect(matching('/internal/membership?x=1')).toHaveLength(0)
  })

  test.each([
    '/v1/client/../internal/membership',
    '/v1/client/%2e%2e/internal/membership',
    '/v1/teams//x',
    '/v1/teams/a%2Fb',
  ])('does not forward %s, which could climb out of its prefix', (path) => {
    expect(matching(path)).toHaveLength(0)
  })

  test('an encoded character in the query string is fine', () => {
    expect(matching('/v1/members?cursor=a%2Fb')).toHaveLength(1)
  })

  test('keeps Host and Origin as the browser sent them, so auth sees the portal origin', () => {
    for (const entry of Object.values(proxy)) {
      expect(entry.changeOrigin).toBe(false)
    }
  })
})

describe('the proxy targets (server-side dev settings)', () => {
  test('default to the local ports', () => {
    expect(parseProxyTargets({})).toEqual({
      auth: 'http://127.0.0.1:3001',
      core: 'http://127.0.0.1:3002',
      playbook: 'http://127.0.0.1:3003',
      voice: 'http://127.0.0.1:3004',
      outbound: 'http://127.0.0.1:3005',
    })
  })

  test('read AUTH_PROXY_TARGET, CORE_PROXY_TARGET, PLAYBOOK_PROXY_TARGET and VOICE_PROXY_TARGET, never a VITE_ variable', () => {
    expect(
      parseProxyTargets({
        AUTH_PROXY_TARGET: 'http://localhost:4001/',
        CORE_PROXY_TARGET: 'https://core.dev.example',
        PLAYBOOK_PROXY_TARGET: 'http://localhost:4003',
        VOICE_PROXY_TARGET: 'http://localhost:4004',
        OUTBOUND_PROXY_TARGET: 'http://localhost:4005',
        VITE_AUTH_BASE_URL: 'http://ignored.example',
      })
    ).toEqual({
      auth: 'http://localhost:4001',
      core: 'https://core.dev.example',
      playbook: 'http://localhost:4003',
      voice: 'http://localhost:4004',
      outbound: 'http://localhost:4005',
    })
  })

  test.each([
    ['not a url'],
    ['ftp://auth.example'],
    ['http://auth.example/v1'],
    ['http://auth.example/?a=1'],
    ['http://user:pw@auth.example'],
  ])('%s is refused, naming the variable', (value) => {
    expect(() => parseProxyTargets({ AUTH_PROXY_TARGET: value })).toThrow('AUTH_PROXY_TARGET')
  })
})
