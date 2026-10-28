/**
 * Which service answers which path. The browser calls only its own origin; the host (the load
 * balancer in a deployment, the dev server's proxy locally) forwards by these prefixes and never
 * adds or strips one, because the refresh cookie's `Path` (`/v1/client/sessions/`) must equal what
 * the browser requests. This module is data and pure functions: the dev proxy uses it, and the hub's
 * docs and the infra ticket read the same table.
 */

/** A service the browser reaches through the portal's origin. */
export type Service = 'auth' | 'core' | 'playbook' | 'voice' | 'outbound'

/** One path prefix and the service that serves everything under it (the prefix itself, or `prefix/...`). */
export type ServiceRoute = { readonly prefix: string; readonly service: Service }

/** The routing table: path prefix to service, forwarded unchanged. */
export const SERVICE_ROUTES: readonly ServiceRoute[] = [
  { prefix: '/v1/client', service: 'auth' },
  { prefix: '/v1/token', service: 'auth' },
  { prefix: '/v1/organization', service: 'core' },
  { prefix: '/v1/members', service: 'core' },
  { prefix: '/v1/invitations', service: 'core' },
  { prefix: '/v1/teams', service: 'core' },
  { prefix: '/v1/marketing', service: 'core' },
  { prefix: '/v1/prospects', service: 'core' },
  { prefix: '/v1/prospect-companies', service: 'core' },
  { prefix: '/v1/prospect-imports', service: 'core' },
  { prefix: '/v1/suppression-entries', service: 'core' },
  { prefix: '/v1/contact-checks', service: 'core' },
  { prefix: '/v1/consent-wordings', service: 'core' },
  { prefix: '/v1/consent-forms', service: 'core' },
  { prefix: '/v1/public/consent-forms', service: 'core' },
  { prefix: '/v1/public/booking-types', service: 'core' },
  { prefix: '/v1/public/bookings', service: 'core' },
  { prefix: '/v1/public/unsubscribe', service: 'core' },
  { prefix: '/v1/public/export-downloads', service: 'core' },
  { prefix: '/v1/public/chat', service: 'voice' },
  { prefix: '/v1/crm', service: 'core' },
  { prefix: '/v1/api-keys', service: 'core' },
  { prefix: '/v1/conversations', service: 'core' },
  { prefix: '/v1/approvals', service: 'core' },
  { prefix: '/v1/drafts', service: 'core' },
  { prefix: '/v1/decisions', service: 'core' },
  { prefix: '/v1/approval-policies', service: 'core' },
  { prefix: '/v1/escalation-rules', service: 'core' },
  { prefix: '/v1/agent-instructions', service: 'core' },
  { prefix: '/v1/audit-events', service: 'core' },
  { prefix: '/v1/audit-csv', service: 'core' },
  { prefix: '/v1/exports', service: 'core' },
  { prefix: '/v1/audit-verification', service: 'core' },
  { prefix: '/v1/analytics', service: 'core' },
  { prefix: '/v1/agent-controls', service: 'core' },
  { prefix: '/v1/assessments', service: 'core' },
  { prefix: '/v1/calendar-connection', service: 'core' },
  { prefix: '/v1/availability', service: 'core' },
  { prefix: '/v1/booking-types', service: 'core' },
  { prefix: '/v1/booking-slots', service: 'core' },
  { prefix: '/v1/bookings', service: 'core' },
  { prefix: '/v1/routing-rules', service: 'core' },
  { prefix: '/v1/assessment-rates', service: 'core' },
  { prefix: '/v1/playbook', service: 'playbook' },
  { prefix: '/v1/lines', service: 'voice' },
  { prefix: '/v1/agent', service: 'voice' },
  { prefix: '/v1/calls', service: 'voice' },
  { prefix: '/v1/copilot', service: 'voice' },
  { prefix: '/v1/softphone', service: 'voice' },
  { prefix: '/v1/handoffs', service: 'voice' },
  { prefix: '/v1/enrichment', service: 'outbound' },
  { prefix: '/v1/enrichment-runs', service: 'outbound' },
  { prefix: '/v1/enrichment-run-sets', service: 'outbound' },
  { prefix: '/v1/signals', service: 'outbound' },
  { prefix: '/v1/signal-settings', service: 'outbound' },
  { prefix: '/v1/signal-webhook', service: 'outbound' },
  { prefix: '/v1/fit-criteria', service: 'outbound' },
  { prefix: '/v1/fit-scores', service: 'outbound' },
]

/**
 * Outbound's routes under a Prospect (enrichment, signals, fit). They sit below core's
 * `/v1/prospects` prefix, so they are matched by shape first, in `serviceFor` and in the dev proxy.
 */
export const OUTBOUND_PROSPECT_PATH = /^\/v1\/prospects\/[^/]+\/(?:enrichment|signals|fit)$/

/**
 * Paths no browser needs and the table leaves out. `/healthz` and `/readyz` are served by every
 * service (a collision, so a probe must address a service directly). `/.well-known/jwks.json` is
 * auth's key set, fetched service to service. `/webhooks/twilio/*` (recording, status, inbound, detection) is
 * called by Twilio on voice directly. `/v1/agent-calls` is the Agent runtime's. `/v1/routing/route` is the call path voice uses to pick a
 * Rep. Anything under `/internal` is never routed.
 */
export const NOT_ROUTED_FROM_BROWSER: readonly string[] = [
  '/healthz',
  '/readyz',
  '/.well-known/jwks.json',
  '/webhooks/twilio/recording',
  '/webhooks/twilio/status',
  '/webhooks/twilio/inbound',
  '/webhooks/twilio/detection',
  '/v1/agent-calls',
  '/v1/routing/route',
]

/** Dot segments, doubled slashes and encoded dots or slashes in a path: never routed, so `/v1/client/../internal/...` cannot slip past the prefix. */
const ODD_PATH = /\.\.|%2[eEfF]|\/\//

function underPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}

/** The service for a request path (no query string), or null when the table does not route it, as for `/internal/...`. */
export function serviceFor(path: string): Service | null {
  if (ODD_PATH.test(path)) {
    return null
  }
  if (OUTBOUND_PROSPECT_PATH.test(path)) {
    return 'outbound'
  }
  const matches = SERVICE_ROUTES.filter((route) => underPrefix(path, route.prefix))
  return matches.length === 1 ? (matches[0]?.service ?? null) : null
}

/** The server-side dev settings: where each service listens. Never shipped to the browser. */
export type ProxyTargets = {
  readonly auth: string
  readonly core: string
  readonly playbook: string
  readonly voice: string
  readonly outbound: string
}

const DEFAULT_TARGETS: ProxyTargets = {
  auth: 'http://127.0.0.1:3001',
  core: 'http://127.0.0.1:3002',
  playbook: 'http://127.0.0.1:3003',
  voice: 'http://127.0.0.1:3004',
  outbound: 'http://127.0.0.1:3005',
}

function originOnly(name: string, value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${name} must be an http(s) origin such as http://127.0.0.1:3001`)
  }
  const bare =
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    url.pathname === '/' &&
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password
  if (!bare) {
    throw new Error(`${name} must be an http(s) origin with no path, query or credentials`)
  }
  return url.origin
}

/** Reads `AUTH_PROXY_TARGET`, `CORE_PROXY_TARGET`, `PLAYBOOK_PROXY_TARGET` and `VOICE_PROXY_TARGET` and `OUTBOUND_PROXY_TARGET` (dev server settings, not `VITE_*`), or throws naming the bad one. */
export function parseProxyTargets(raw: Readonly<Record<string, string | undefined>>): ProxyTargets {
  const read = (name: string, fallback: string) => {
    const value = raw[name]?.trim()
    return originOnly(name, value === undefined || value === '' ? fallback : value)
  }
  return {
    auth: read('AUTH_PROXY_TARGET', DEFAULT_TARGETS.auth),
    core: read('CORE_PROXY_TARGET', DEFAULT_TARGETS.core),
    playbook: read('PLAYBOOK_PROXY_TARGET', DEFAULT_TARGETS.playbook),
    voice: read('VOICE_PROXY_TARGET', DEFAULT_TARGETS.voice),
    outbound: read('OUTBOUND_PROXY_TARGET', DEFAULT_TARGETS.outbound),
  }
}

/** One dev-proxy entry, in the shape the dev server takes for its proxy setting. */
export type ProxyEntry = { readonly target: string; readonly changeOrigin: false }

/**
 * Vite proxy entries keyed by a regular expression per prefix. `changeOrigin: false` leaves `Host`
 * and `Origin` as the browser sent them, so auth sees the portal's origin as `Origin`. Paths pass
 * through unchanged. No entry exists for `/internal`, so it is never forwarded.
 */
export function devProxy(targets: ProxyTargets): Record<string, ProxyEntry> {
  // First, so a Prospect's enrichment, signals and fit reach outbound and not core (first match wins).
  const entries: Record<string, ProxyEntry> = {
    '^\\/v1\\/prospects\\/[^/?#]+\\/(?:enrichment|signals|fit)(?:[?#]|$)': {
      target: targets.outbound,
      changeOrigin: false,
    },
  }
  for (const route of SERVICE_ROUTES) {
    const escaped = route.prefix.replaceAll('/', '\\/')
    entries[`^(?![^?#]*(?:\\.\\.|%2[eEfF]|\\/\\/))${escaped}(?:[/?#]|$)`] = {
      target: targets[route.service],
      changeOrigin: false,
    }
  }
  return entries
}
