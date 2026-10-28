import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { type RightsWording, rightsWordingFor } from 'tula-closeline-contract'
import { type AgentApi, createAgentApi } from '~/api/agent'
import { type AnalyticsApi, createAnalyticsApi } from '~/api/analytics'
import { type ApiKeysApi, createApiKeysApi } from '~/api/api-keys'
import { type ApprovalsApi, createApprovalsApi } from '~/api/approvals'
import { type AssessmentsApi, createAssessmentsApi } from '~/api/assessments'
import { type AuditApi, createAuditApi } from '~/api/audit'
import { type AuthApi, CLIENT_TYPE_HEADER, createAuthApi } from '~/api/auth'
import { type BookingTypesApi, createBookingTypesApi } from '~/api/booking-types'
import { type BookingsApi, createBookingsApi } from '~/api/bookings'
import { type CalendarApi, createCalendarApi } from '~/api/calendar'
import { type CallsApi, createCallsApi } from '~/api/calls'
import { type ConsentApi, createConsentApi } from '~/api/consent'
import {
  type ConsentFormsApi,
  createConsentFormsApi,
  createHostedConsentApi,
  type HostedConsentApi,
} from '~/api/consent-forms'
import { type CoreApi, createCoreApi } from '~/api/core'
import { createEscalationApi, type EscalationApi } from '~/api/escalation'
import { createExportsApi, type ExportsApi } from '~/api/exports'
import { createHttpClient, type Fetch } from '~/api/http'
import { createKeyHolder, type KeyHolder } from '~/api/idempotency'
import { createInboxApi, type InboxApi } from '~/api/inbox'
import { createMarketingApi, type MarketingApi } from '~/api/marketing'
import { createOutboundApi, type OutboundApi } from '~/api/outbound'
import { createPlaybookApi, type PlaybookApi } from '~/api/playbook'
import { createPublicBookingApi, type PublicBookingApi } from '~/api/public-booking'
import { createRoutingApi, type RoutingApi } from '~/api/routing'
import { createSalesHistoryApi, type SalesHistoryApi } from '~/api/sales-history'
import { createUnsubscribeApi, type UnsubscribeApi } from '~/api/unsubscribe'
import { createVoiceApi, type VoiceApi } from '~/api/voice'
import { createPendingCall, type PendingCallHolder } from '~/data/pending-call'
import type { Env } from '~/env'
import { createInvitationHolder, type InvitationHolder } from '~/invitation'
import type { Reporter } from '~/report/reporter'
import { createSession, type Session, type SessionChannel } from '~/session/session'

/** Everything the screens use, built once: the single place the pieces are wired together. */
export type App = {
  readonly env: Env
  readonly auth: AuthApi
  readonly core: CoreApi
  readonly playbook: PlaybookApi
  readonly voice: VoiceApi
  readonly calls: CallsApi
  readonly apiKeys: ApiKeysApi
  readonly inbox: InboxApi
  readonly approvals: ApprovalsApi
  readonly escalation: EscalationApi
  /** The analytics dashboards: series, comparison tables and their CSV. */
  readonly analytics: AnalyticsApi
  /** The review of assessed Agent output: flagged assessments, feedback and failure rates (Owner, Admin). */
  readonly assessments: AssessmentsApi
  /** The audit log: events, the CSV and the hash-chain check. */
  readonly audit: AuditApi
  /** The Organization data export: request, watch, download. */
  readonly exports: ExportsApi
  /** Agent instructions, control levels and the pause switch. */
  readonly agent: AgentApi
  /** The caller's own Calendar Connection and working hours. */
  readonly calendar: CalendarApi
  /** The Organization's Booking Types (Owner, Admin define them). */
  readonly bookingTypes: BookingTypesApi
  readonly bookings: BookingsApi
  /** The Routing Rule routes of core. */
  readonly routing: RoutingApi
  /** Contact Consent on a Prospect, and the Suppression list. */
  readonly consent: ConsentApi
  /** Enrichment, Signals and Fit, served by outbound. */
  readonly outbound: OutboundApi
  /** Hosted consent forms: draft, publish and close (Owner, Admin). */
  readonly consentForms: ConsentFormsApi
  /** The public hosted consent page's routes (a link from a message); send no token. */
  readonly hostedConsent: HostedConsentApi
  /** The public marketing route (the Demo Request form); sends no token. */
  readonly marketing: MarketingApi
  /** The public unsubscribe routes (a link from a message); send no token. */
  readonly unsubscribe: UnsubscribeApi
  /** The public booking routes (a Booking Type link); send no token. */
  readonly publicBooking: PublicBookingApi
  readonly salesHistory: SalesHistoryApi
  /** The Transcript chosen but not yet sent, held in memory across the rights confirmation. */
  readonly pendingCall: PendingCallHolder
  /** The text of a rights wording version, from the contract: a version with none cannot be confirmed. */
  readonly rightsWording: (version: number) => RightsWording | undefined
  /** Waits `milliseconds` (the injected `sleep` in tests): the document poll and a `Retry-After` wait use it. */
  readonly sleep: (milliseconds: number) => Promise<void>
  /** Leaves the page for another address (`location.assign`; tests stand in a recorder). */
  readonly assign: (url: string) => void
  readonly session: Session
  readonly reporter: Reporter
  readonly queryClient: QueryClient
  readonly invitation: InvitationHolder
  /**
   * The idempotency key of the write in flight, one holder per kind of write (bounded). They live
   * here, not in a screen, so leaving a screen after an unknown outcome keeps the key; they are
   * dropped on sign-out and when the Organization changes.
   */
  readonly keys: KeyHolder
}

/** What `createApp` takes; tests pass a `fetch` double and a no-wait `sleep`. */
export type AppInit = {
  readonly env: Env
  readonly reporter: Reporter
  readonly fetch?: Fetch
  readonly sleep?: (milliseconds: number) => Promise<void>
  readonly random?: () => number
  /** Leaves the page for another address; `location.assign` when omitted. */
  readonly assign?: (url: string) => void
  readonly now?: () => number
  readonly timeoutMs?: number
  /** The line to the other tabs; none when omitted (tests), so apps in one process never hear each other. */
  readonly channel?: SessionChannel
  /** The holder that already took the Invitation from the address; a new one when omitted. */
  readonly invitation?: InvitationHolder
  /** The text of a rights wording version; the contract's table when omitted (tests stand in a second version). */
  readonly rightsWording?: (version: number) => RightsWording | undefined
}

/** Builds the app: HTTP clients for auth, core, playbook and voice, the session, the query cache and the reporter. */
export function createApp(init: AppInit): App {
  const shared = {
    ...(init.fetch ? { fetch: init.fetch } : {}),
    ...(init.sleep ? { sleep: init.sleep } : {}),
    ...(init.random ? { random: init.random } : {}),
    ...(init.timeoutMs === undefined ? {} : { timeoutMs: init.timeoutMs }),
  }
  // Every path is same-origin (the host or the dev server routes it to a service), so there is no
  // service URL here and no CORS.
  // The server's clock, from the `Date` of the latest auth response, so an access token's lifetime
  // does not depend on the browser's clock being right.
  const clock = init.now ?? (() => performance.now())
  let serverDate: { readonly at: number; readonly ms: number } | undefined
  const authHttp = createHttpClient({
    ...shared,
    headers: CLIENT_TYPE_HEADER,
    onResponse(response) {
      const ms = Date.parse(response.headers.get('date') ?? '')
      serverDate = Number.isNaN(ms) ? undefined : { at: clock(), ms }
    },
  })
  const auth = createAuthApi(authHttp)
  const session = createSession({
    refresh: () => auth.refresh(),
    revoke: () => auth.signOut(),
    ...(init.channel ? { channel: init.channel } : {}),
    ...(init.now ? { now: init.now } : {}),
    serverNow: () =>
      serverDate === undefined ? undefined : serverDate.ms + (clock() - serverDate.at),
    // Status and code only: the error carries nothing else, and 4xx is otherwise never reported.
    onRefused: (error) =>
      init.reporter.report(new Error(`Session restore refused: ${error.status} ${error.code}`)),
  })
  const coreHttp = createHttpClient({ ...shared, authorizer: session })
  const sleep =
    init.sleep ??
    ((milliseconds: number) => new Promise<void>((done) => setTimeout(done, milliseconds)))
  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error) => init.reporter.report(error) }),
    mutationCache: new MutationCache({ onError: (error) => init.reporter.report(error) }),
    defaultOptions: {
      // The HTTP client owns retries; a mutation's result (and so any token) is not kept around.
      queries: { retry: false, refetchOnWindowFocus: false, staleTime: 60_000 },
      mutations: { retry: false, gcTime: 0 },
    },
  })
  const keys = createKeyHolder()
  const pendingCall = createPendingCall()
  const organizationOf = () => {
    const snapshot = session.getSnapshot()
    return snapshot.status === 'signed_in' ? snapshot.organization.id : null
  }
  let currentOrganization = organizationOf()
  session.subscribe(() => {
    const next = organizationOf()
    // Sign-out, or another Organization (this tab adopted it through a refresh): nothing of the
    // old one may be shown, and no key of a write meant for it may be sent again.
    if (session.getSnapshot().status === 'signed_out' || next !== currentOrganization) {
      queryClient.clear()
      keys.clear()
      pendingCall.clear()
    }
    currentOrganization = next
  })
  return {
    env: init.env,
    auth,
    core: createCoreApi(coreHttp),
    playbook: createPlaybookApi(coreHttp),
    voice: createVoiceApi(coreHttp),
    calls: createCallsApi(coreHttp),
    apiKeys: createApiKeysApi(coreHttp),
    inbox: createInboxApi(coreHttp),
    approvals: createApprovalsApi(coreHttp),
    escalation: createEscalationApi(coreHttp),
    analytics: createAnalyticsApi(coreHttp),
    assessments: createAssessmentsApi(coreHttp),
    audit: createAuditApi(coreHttp),
    exports: createExportsApi(coreHttp),
    agent: createAgentApi(coreHttp),
    calendar: createCalendarApi(coreHttp),
    bookingTypes: createBookingTypesApi(coreHttp),
    bookings: createBookingsApi(coreHttp),
    routing: createRoutingApi(coreHttp),
    consent: createConsentApi(coreHttp),
    outbound: createOutboundApi(coreHttp),
    consentForms: createConsentFormsApi(coreHttp),
    hostedConsent: createHostedConsentApi(coreHttp),
    marketing: createMarketingApi(coreHttp),
    unsubscribe: createUnsubscribeApi(coreHttp),
    publicBooking: createPublicBookingApi(coreHttp),
    salesHistory: createSalesHistoryApi(coreHttp, init.reporter.report),
    sleep,
    assign: init.assign ?? ((url) => window.location.assign(url)),
    session,
    reporter: init.reporter,
    queryClient,
    invitation: init.invitation ?? createInvitationHolder(),
    keys,
    pendingCall,
    rightsWording: init.rightsWording ?? rightsWordingFor,
  }
}
