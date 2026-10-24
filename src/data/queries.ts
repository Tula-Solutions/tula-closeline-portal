import { type InfiniteData, useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import {
  type CallState,
  type DocumentState,
  type ListDealImportRowsResponse,
  type ListDealImportsResponse,
  type ListDealsResponse,
  type ListDocumentsResponse,
  type ListInvitationsResponse,
  type ListMembersResponse,
  type ListProspectCompaniesResponse,
  type ListProspectImportRowsResponse,
  type ListProspectImportsResponse,
  type ListProspectsResponse,
  type ListTeamsResponse,
  MAX_MEMBER_IDS,
  MAX_MEMBER_QUERY_LENGTH,
  MAX_PAGE_SIZE,
  MAX_PROSPECT_COMPANY_IDS,
  type Outcome,
  type ProspectImportRowResult,
  prospectCompanyIdSchema,
  type Role,
} from 'tula-closeline-contract'
import type { ApiKeysPage } from '~/api/api-keys'
import type {
  ConsentEventsPage,
  ConsentWordingsPage,
  SuppressionFilter,
  SuppressionPage,
} from '~/api/consent'
import type { ProspectFilter } from '~/api/core'
import type { ConversationFilter, ConversationsPage, MessagesPage } from '~/api/inbox'
import type { CallsPage } from '~/api/sales-history'
import type { LinesPage } from '~/api/voice'
import type { App } from '~/app'
import { useApp, useSessionState } from '~/app-context'
import { companyName } from '~/data/prospects'
import type { PagedState } from '~/ui/Paged'

/** Query keys, one place so a mutation can refresh exactly what it changed. */
export const KEYS = {
  members: (organizationId: string) => [organizationId, 'members'] as const,
  invitations: (organizationId: string) => [organizationId, 'invitations'] as const,
  teams: (organizationId: string) => [organizationId, 'teams'] as const,
  /** The Lines of the Organization (voice service). */
  lines: (organizationId: string) => [organizationId, 'lines'] as const,
  /** Every cached read about the inbox (Conversation lists, single Conversations and their Messages). */
  inbox: (organizationId: string) => [organizationId, 'inbox'] as const,
  /** The API keys of the Organization (core). */
  apiKeys: (organizationId: string) => [organizationId, 'api-keys'] as const,
  /** Every list of documents of the Organization, whatever its state filter: invalidate this to refresh them all. */
  documents: (organizationId: string) => [organizationId, 'documents'] as const,
  /** Every cached read about Deals (lists and single Deals): invalidate this after an Outcome changes. */
  deals: (organizationId: string) => [organizationId, 'deals'] as const,
  /** Every cached read about Deal imports (lists, single imports and reports). */
  dealImports: (organizationId: string) => [organizationId, 'deal-imports'] as const,
  /** Every cached read about Prospect imports (lists, single imports and reports). */
  prospectImports: (organizationId: string) => [organizationId, 'prospect-imports'] as const,
  /** Every cached list of Calls, whatever its filters. */
  calls: (organizationId: string) => [organizationId, 'calls'] as const,
  /** Every cached read about Prospects (lists and single Prospects): invalidate this after one changes. */
  prospects: (organizationId: string) => [organizationId, 'prospects'] as const,
  /** Every cached read about Prospect Companies. */
  prospectCompanies: (organizationId: string) => [organizationId, 'prospect-companies'] as const,
  /** Every cached read about Contact Consent (a Prospect's states, ledger and the Consent Wordings). */
  consent: (organizationId: string) => [organizationId, 'consent'] as const,
  /** Every cached list of Suppression entries, whatever its filters. */
  suppression: (organizationId: string) => [organizationId, 'suppression'] as const,
  /** The rights confirmation. */
  rights: (organizationId: string) => [organizationId, 'rights'] as const,
}

/** Refetches one list of the Organization the session is in now; resolves when the fresh data is in. */
export function refresh(app: App, list: keyof typeof KEYS): Promise<void> {
  const snapshot = app.session.getSnapshot()
  if (snapshot.status !== 'signed_in') {
    return Promise.resolve()
  }
  return app.queryClient.invalidateQueries({ queryKey: KEYS[list](snapshot.organization.id) })
}

type Page<T> = { readonly items: readonly T[]; readonly nextCursor: string | null }

function pagedState<T extends { readonly id: string }>(query: PagedQuery<T>) {
  return pagedStateBy(query, (item) => item.id)
}

type PagedQuery<T> = {
  isPending: boolean
  isError: boolean
  error: unknown
  data: InfiniteData<Page<T>, string | undefined> | undefined
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => unknown
  refetch: () => unknown
}

function pagedStateBy<T>(
  query: PagedQuery<T>,
  keyOf: (item: T) => string
): { state: PagedState; items: readonly T[] } {
  // A list can shift between pages (a row added or removed), so a row may come twice: show it once.
  const seen = new Set<string>()
  const items = (query.data?.pages.flatMap((page) => page.items) ?? []).filter((item) => {
    const key = keyOf(item)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
  return {
    items,
    state: {
      isPending: query.isPending,
      isError: query.isError,
      error: query.error,
      hasData: query.data !== undefined,
      isEmpty: query.data !== undefined && items.length === 0,
      hasNextPage: query.hasNextPage,
      isFetchingNextPage: query.isFetchingNextPage,
      fetchNextPage: () => void query.fetchNextPage(),
      refetch: () => void query.refetch(),
    },
  }
}

function useOrganizationId(): string {
  const session = useSessionState()
  return session.status === 'signed_in' ? session.organization.id : ''
}

/** The members, a page at a time. `enabled` is false for a role that may not list them (no request is made). */
export function useMembers(enabled: boolean) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const query = useInfiniteQuery<
    ListMembersResponse,
    Error,
    InfiniteData<ListMembersResponse, string | undefined>,
    readonly [string, string],
    string | undefined
  >({
    queryKey: KEYS.members(organizationId),
    queryFn: ({ pageParam, signal }) => app.core.listMembers({ cursor: pageParam, signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: enabled && organizationId !== '',
  })
  return pagedState(query)
}

/** The pending Invitations, a page at a time. */
export function useInvitations(enabled: boolean) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const query = useInfiniteQuery<
    ListInvitationsResponse,
    Error,
    InfiniteData<ListInvitationsResponse, string | undefined>,
    readonly [string, string],
    string | undefined
  >({
    queryKey: KEYS.invitations(organizationId),
    queryFn: ({ pageParam, signal }) => app.core.listInvitations({ cursor: pageParam, signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: enabled && organizationId !== '',
  })
  return pagedState(query)
}

/** The Teams, a page at a time. */
export function useTeams() {
  const app = useApp()
  const organizationId = useOrganizationId()
  const query = useInfiniteQuery<
    ListTeamsResponse,
    Error,
    InfiniteData<ListTeamsResponse, string | undefined>,
    readonly [string, string],
    string | undefined
  >({
    queryKey: KEYS.teams(organizationId),
    queryFn: ({ pageParam, signal }) => app.core.listTeams({ cursor: pageParam, signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: organizationId !== '',
  })
  return pagedState(query)
}

/**
 * Teams for a choice: pages are read one after another up to `MEMBER_OPTION_PAGES`, so a later
 * Team can be picked too. No request is made unless `enabled`.
 */
export function useTeamOptions(enabled: boolean) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const query = useInfiniteQuery<
    ListTeamsResponse,
    Error,
    InfiniteData<ListTeamsResponse, string | undefined>,
    readonly string[],
    string | undefined
  >({
    queryKey: [...KEYS.teams(organizationId), 'options'],
    queryFn: ({ pageParam, signal }) =>
      app.core.listTeams({ cursor: pageParam, limit: MAX_PAGE_SIZE, signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: enabled && organizationId !== '',
  })
  const { fetchNextPage, hasNextPage, isFetchingNextPage, isError } = query
  const pageCount = query.data?.pages.length ?? 0
  // pageCount is a dependency so each arrived page asks for the next one.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError && pageCount < MEMBER_OPTION_PAGES) {
      void fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage, pageCount])
  return { items: (query.data?.pages ?? []).flatMap((page) => page.items) }
}

/** The Lines, a page at a time. `enabled` is false for a role that may not manage them (no request is made). */
export function useLines(enabled: boolean) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const query = useInfiniteQuery<
    LinesPage,
    Error,
    InfiniteData<LinesPage, string | undefined>,
    readonly [string, string],
    string | undefined
  >({
    queryKey: KEYS.lines(organizationId),
    queryFn: ({ pageParam, signal }) => app.voice.listLines({ cursor: pageParam, signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: enabled && organizationId !== '',
  })
  return pagedState(query)
}

/** The API keys, a page at a time. `enabled` is false for a role that may not manage them (no request is made). */
export function useApiKeys(enabled: boolean) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const query = useInfiniteQuery<
    ApiKeysPage,
    Error,
    InfiniteData<ApiKeysPage, string | undefined>,
    readonly [string, string],
    string | undefined
  >({
    queryKey: KEYS.apiKeys(organizationId),
    queryFn: ({ pageParam, signal }) => app.apiKeys.listApiKeys({ cursor: pageParam, signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: enabled && organizationId !== '',
  })
  return pagedState(query)
}

/** The Conversations the caller may see, latest activity first, a page at a time and narrowed by the filter. */
export function useConversations(filter: ConversationFilter) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const query = useInfiniteQuery<
    ConversationsPage,
    Error,
    InfiniteData<ConversationsPage, string | undefined>,
    readonly string[],
    string | undefined
  >({
    queryKey: [
      ...KEYS.inbox(organizationId),
      'list',
      filter.channel ?? '',
      filter.state ?? '',
      filter.label ?? '',
    ],
    queryFn: ({ pageParam, signal }) =>
      app.inbox.listConversations({ ...filter, cursor: pageParam, signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: organizationId !== '',
  })
  return pagedState(query)
}

/** One Conversation. */
export function useConversation(conversationId: string) {
  const app = useApp()
  const organizationId = useOrganizationId()
  return useQuery({
    queryKey: [...KEYS.inbox(organizationId), 'one', conversationId],
    queryFn: ({ signal }) => app.inbox.getConversation(conversationId, signal),
    enabled: organizationId !== '',
    retry: false,
  })
}

/** The Messages of one Conversation, oldest first, a page at a time. */
export function useConversationMessages(conversationId: string) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const query = useInfiniteQuery<
    MessagesPage,
    Error,
    InfiniteData<MessagesPage, string | undefined>,
    readonly string[],
    string | undefined
  >({
    queryKey: [...KEYS.inbox(organizationId), 'messages', conversationId],
    queryFn: ({ pageParam, signal }) =>
      app.inbox.listMessages(conversationId, { cursor: pageParam, signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: organizationId !== '',
  })
  return pagedState(query)
}

/** The Playbook documents in one state (or, with none, every document that is not deleted), a page at a time. */
export function useDocuments(state: DocumentState | undefined) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const query = useInfiniteQuery<
    ListDocumentsResponse,
    Error,
    InfiniteData<ListDocumentsResponse, string | undefined>,
    readonly [string, string, string],
    string | undefined
  >({
    queryKey: [...KEYS.documents(organizationId), state ?? 'current'],
    queryFn: ({ pageParam, signal }) =>
      app.playbook.listDocuments({ cursor: pageParam, state, signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: organizationId !== '',
  })
  return { ...pagedState(query), refetch: () => query.refetch() }
}

/** The Organization's rights confirmation and the wording version to show (Owner, Admin). */
export function useRights(enabled: boolean) {
  const app = useApp()
  const organizationId = useOrganizationId()
  return useQuery({
    queryKey: KEYS.rights(organizationId),
    queryFn: ({ signal }) => app.salesHistory.getRights(signal),
    enabled: enabled && organizationId !== '',
  })
}

/** Deals, a page at a time, newest first; with an Outcome only Deals with it, and `unseen` only Deals no CSV has named. */
export function useDeals(filter: {
  readonly outcome?: Outcome | undefined
  readonly unseen: boolean
}) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const query = useInfiniteQuery<
    ListDealsResponse,
    Error,
    InfiniteData<ListDealsResponse, string | undefined>,
    readonly [string, string, string, string, string],
    string | undefined
  >({
    queryKey: [
      ...KEYS.deals(organizationId),
      'list',
      filter.outcome ?? 'any',
      filter.unseen ? 'unseen' : 'all',
    ],
    queryFn: ({ pageParam, signal }) =>
      app.salesHistory.listDeals({
        cursor: pageParam,
        outcome: filter.outcome,
        appearedInImport: filter.unseen ? false : undefined,
        signal,
      }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: organizationId !== '',
  })
  return pagedState(query)
}

/** One Deal by its opaque id. */
export function useDeal(dealRecordId: string) {
  const app = useApp()
  const organizationId = useOrganizationId()
  return useQuery({
    queryKey: [...KEYS.deals(organizationId), 'one', dealRecordId],
    queryFn: ({ signal }) => app.salesHistory.getDeal(dealRecordId, signal),
    enabled: organizationId !== '',
  })
}

/** One Call read alone, which (unlike a page of Calls) carries the speaker excerpts; only while `enabled`. */
export function useCallSpeakers(callId: string, enabled: boolean) {
  const app = useApp()
  const organizationId = useOrganizationId()
  return useQuery({
    queryKey: [...KEYS.calls(organizationId), 'one', callId],
    queryFn: ({ signal }) => app.salesHistory.getCall(callId, signal),
    enabled: enabled && organizationId !== '',
    retry: false,
  })
}

/** Deal imports, a page at a time, newest first. */
export function useDealImports() {
  const app = useApp()
  const organizationId = useOrganizationId()
  const query = useInfiniteQuery<
    ListDealImportsResponse,
    Error,
    InfiniteData<ListDealImportsResponse, string | undefined>,
    readonly [string, string, string],
    string | undefined
  >({
    queryKey: [...KEYS.dealImports(organizationId), 'list'],
    queryFn: ({ pageParam, signal }) =>
      app.salesHistory.listDealImports({ cursor: pageParam, signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: organizationId !== '',
  })
  return { ...pagedState(query), refetch: () => query.refetch() }
}

/** One import with its state and counts. */
export function useDealImport(importId: string) {
  const app = useApp()
  const organizationId = useOrganizationId()
  return useQuery({
    queryKey: [...KEYS.dealImports(organizationId), 'one', importId],
    queryFn: ({ signal }) => app.salesHistory.getDealImport(importId, signal),
    enabled: organizationId !== '',
  })
}

/** An import's report, a page at a time; `rejectedOnly` lists only the rows that need fixing. */
export function useImportRows(importId: string, rejectedOnly: boolean, enabled: boolean) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const query = useInfiniteQuery<
    ListDealImportRowsResponse,
    Error,
    InfiniteData<ListDealImportRowsResponse, string | undefined>,
    readonly [string, string, string, string, string],
    string | undefined
  >({
    queryKey: [
      ...KEYS.dealImports(organizationId),
      'rows',
      importId,
      rejectedOnly ? 'rejected' : 'all',
    ],
    queryFn: ({ pageParam, signal }) =>
      app.salesHistory.listDealImportRows(importId, {
        cursor: pageParam,
        result: rejectedOnly ? 'rejected' : undefined,
        signal,
      }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: enabled && organizationId !== '',
  })
  return pagedStateBy(query, (row) => String(row.rowNumber))
}

/** Prospect imports, a page at a time, newest first. */
export function useProspectImports() {
  const app = useApp()
  const organizationId = useOrganizationId()
  const query = useInfiniteQuery<
    ListProspectImportsResponse,
    Error,
    InfiniteData<ListProspectImportsResponse, string | undefined>,
    readonly [string, string, string],
    string | undefined
  >({
    queryKey: [...KEYS.prospectImports(organizationId), 'list'],
    queryFn: ({ pageParam, signal }) => app.core.listProspectImports({ cursor: pageParam, signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: organizationId !== '',
  })
  return { ...pagedState(query), refetch: () => query.refetch() }
}

/** One Prospect import with its state and counts. */
export function useProspectImport(importId: string) {
  const app = useApp()
  const organizationId = useOrganizationId()
  return useQuery({
    queryKey: [...KEYS.prospectImports(organizationId), 'one', importId],
    queryFn: ({ signal }) => app.core.getProspectImport(importId, signal),
    enabled: organizationId !== '',
  })
}

/** A Prospect import's report, a page at a time; `result` lists only the rows that ended so. */
export function useProspectImportRows(
  importId: string,
  result: 'all' | ProspectImportRowResult,
  enabled: boolean
) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const query = useInfiniteQuery<
    ListProspectImportRowsResponse,
    Error,
    InfiniteData<ListProspectImportRowsResponse, string | undefined>,
    readonly [string, string, string, string, string],
    string | undefined
  >({
    queryKey: [...KEYS.prospectImports(organizationId), 'rows', importId, result],
    queryFn: ({ pageParam, signal }) =>
      app.core.listProspectImportRows(importId, {
        cursor: pageParam,
        result: result === 'all' ? undefined : result,
        signal,
      }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: enabled && organizationId !== '',
  })
  return pagedStateBy(query, (row) => String(row.rowNumber))
}

/**
 * One list read once for a dashboard count: a single page at the largest size the server allows,
 * never a second page. `more` says a next cursor came back, so the count is a floor ("100+").
 */
export type FirstPage<T> = {
  readonly isPending: boolean
  readonly isError: boolean
  readonly items: readonly T[]
  readonly more: boolean
}

function useFirstPage<T>(
  key: readonly unknown[],
  read: (signal: AbortSignal) => Promise<Page<T>>,
  enabled: boolean
): FirstPage<T> {
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => read(signal),
    enabled,
  })
  return {
    isPending: query.isPending,
    isError: query.isError,
    items: query.data?.items ?? [],
    more: query.data !== undefined && query.data.nextCursor !== null,
  }
}

/** The members' first page for Home's count; no request for a role that may not list them. */
export function useMembersFirstPage(enabled: boolean) {
  const app = useApp()
  const organizationId = useOrganizationId()
  return useFirstPage(
    [...KEYS.members(organizationId), 'first-page'],
    (signal) => app.core.listMembers({ limit: MAX_PAGE_SIZE, signal }),
    enabled && organizationId !== ''
  )
}

/** The current documents' first page (newest first) for Home's count and recent list. */
export function useDocumentsFirstPage() {
  const app = useApp()
  const organizationId = useOrganizationId()
  return useFirstPage(
    [...KEYS.documents(organizationId), 'first-page'],
    (signal) => app.playbook.listDocuments({ limit: MAX_PAGE_SIZE, signal }),
    organizationId !== ''
  )
}

/** The won Deals' first page for Home's count; no request unless `enabled`. */
export function useWonDealsFirstPage(enabled: boolean) {
  const app = useApp()
  const organizationId = useOrganizationId()
  return useFirstPage(
    [...KEYS.deals(organizationId), 'first-page', 'won'],
    (signal) => app.salesHistory.listDeals({ limit: MAX_PAGE_SIZE, outcome: 'won', signal }),
    enabled && organizationId !== ''
  )
}

/** The current Calls' first page for Home's count; no request unless `enabled`. */
export function useCallsFirstPage(enabled: boolean) {
  const app = useApp()
  const organizationId = useOrganizationId()
  return useFirstPage(
    [...KEYS.calls(organizationId), 'first-page'],
    (signal) => app.salesHistory.listCalls({ limit: MAX_PAGE_SIZE, signal }),
    enabled && organizationId !== ''
  )
}

/** Calls, a page at a time, newest first; with a state only Calls in it, with a Deal (opaque id) only its Calls. */
export function useCalls(filter: {
  readonly state?: CallState | undefined
  readonly dealRecordId?: string | undefined
}) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const query = useInfiniteQuery<
    CallsPage,
    Error,
    InfiniteData<CallsPage, string | undefined>,
    readonly [string, string, string, string, string],
    string | undefined
  >({
    queryKey: [
      ...KEYS.calls(organizationId),
      'list',
      filter.state ?? 'current',
      filter.dealRecordId ?? 'any',
    ],
    queryFn: ({ pageParam, signal }) =>
      app.salesHistory.listCalls({
        cursor: pageParam,
        state: filter.state,
        dealRecordId: filter.dealRecordId,
        signal,
      }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: organizationId !== '',
  })
  return { ...pagedState(query), refetch: () => query.refetch() }
}

/** How many pages in a row may come back empty before the screen stops asking and offers "Load more". */
export const MAX_EMPTY_PAGES = 5

/**
 * The Prospects the caller may see, a page at a time. A page may hold fewer than the page size,
 * even none, while a cursor is present (core filters after it reads), so the list is empty only
 * when no cursor is left; while nothing has been found yet the next page is asked for, up to
 * `MAX_EMPTY_PAGES`, and then the person decides with "Load more".
 */
export function useProspects(filter: ProspectFilter) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const query = useInfiniteQuery<
    ListProspectsResponse,
    Error,
    InfiniteData<ListProspectsResponse, string | undefined>,
    readonly string[],
    string | undefined
  >({
    queryKey: [
      ...KEYS.prospects(organizationId),
      'list',
      filter.q ?? '',
      filter.status ?? '',
      filter.source ?? '',
      filter.ownerMembershipId ?? '',
      filter.companyId ?? '',
    ],
    queryFn: ({ pageParam, signal }) =>
      app.core.listProspects({ ...filter, cursor: pageParam, signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: organizationId !== '',
  })
  const paged = pagedState(query)
  const pages = query.data?.pages ?? []
  const searching =
    query.data !== undefined &&
    paged.items.length === 0 &&
    query.hasNextPage &&
    pages.length <= MAX_EMPTY_PAGES
  const { fetchNextPage, isFetchingNextPage, isError } = query
  const pageCount = pages.length
  // pageCount is a dependency so each arrived empty page asks for the next, even when a fast
  // fetch never showed as "fetching" in a render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pageCount only re-triggers the effect
  useEffect(() => {
    if (searching && !isFetchingNextPage && !isError) {
      void fetchNextPage()
    }
  }, [searching, isFetchingNextPage, isError, fetchNextPage, pageCount])
  return {
    items: paged.items,
    state: {
      ...paged.state,
      // Nothing yet is not nothing at all: only an end of the list with no rows says "empty".
      isEmpty: paged.state.isEmpty && !query.hasNextPage,
      isPending: paged.state.isPending || searching,
    },
  }
}

/** One Prospect with the Source and time of each field. */
export function useProspect(prospectId: string) {
  const app = useApp()
  const organizationId = useOrganizationId()
  return useQuery({
    queryKey: [...KEYS.prospects(organizationId), 'one', prospectId],
    queryFn: ({ signal }) => app.core.getProspect(prospectId, signal),
    enabled: organizationId !== '' && prospectId !== '',
    retry: false,
  })
}

/** How many Prospect Companies the picker shows for one search; a longer list asks for more of the name. */
export const COMPANY_PICKER_SIZE = 25

/** The most pages of members the Owner choices read (at the largest page size), so a huge Organization stays bounded. */
export const MEMBER_OPTION_PAGES = 10

/** Prospect Companies whose name matches `term` (core's `q`), the first page only; an empty term lists the first ones. */
export function useProspectCompanySearch(term: string) {
  const app = useApp()
  const organizationId = useOrganizationId()
  return useQuery<ListProspectCompaniesResponse>({
    queryKey: [...KEYS.prospectCompanies(organizationId), 'search', term],
    queryFn: ({ signal }) =>
      app.core.listProspectCompanies({
        limit: COMPANY_PICKER_SIZE,
        q: term === '' ? undefined : term,
        signal,
      }),
    enabled: organizationId !== '',
    placeholderData: (previous) => previous,
  })
}

/** One Prospect Company by id; nothing is asked for while `companyId` is empty. */
export function useProspectCompany(companyId: string | null) {
  const app = useApp()
  const organizationId = useOrganizationId()
  return useQuery({
    queryKey: [...KEYS.prospectCompanies(organizationId), 'one', companyId ?? ''],
    queryFn: ({ signal }) => app.core.getProspectCompany(companyId ?? '', signal),
    enabled: organizationId !== '' && companyId !== null && companyId !== '',
    retry: false,
  })
}

/**
 * The names of exactly the Prospect Companies a screen shows. The ids (each once, malformed ones
 * dropped) are read in chunks of at most `MAX_PROSPECT_COMPANY_IDS`, one `ids` request per chunk;
 * a Company the answer leaves out has no name here.
 */
export function useProspectCompanyNames(
  companyIds: readonly string[]
): ReadonlyMap<string, string> {
  const app = useApp()
  const organizationId = useOrganizationId()
  const unique = [
    ...new Set(companyIds.filter((id) => prospectCompanyIdSchema.safeParse(id).success)),
  ]
  const chunks: string[][] = []
  for (let start = 0; start < unique.length; start += MAX_PROSPECT_COMPANY_IDS) {
    chunks.push(unique.slice(start, start + MAX_PROSPECT_COMPANY_IDS))
  }
  const results = useQueries({
    queries: chunks.map((chunk) => ({
      queryKey: [...KEYS.prospectCompanies(organizationId), 'ids', chunk.join(',')],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        app.core.listProspectCompanies({ ids: chunk, limit: chunk.length, signal }),
      enabled: organizationId !== '',
      retry: false,
      // A page loaded later grows the last chunk: keep the names already known meanwhile.
      placeholderData: (previous: ListProspectCompaniesResponse | undefined) => previous,
    })),
  })
  const names = new Map<string, string>()
  for (const result of results) {
    for (const company of result.data?.items ?? []) {
      names.set(company.id, companyName(company))
    }
  }
  return names
}

/** How many members the Owner choice shows for one search; a longer list asks for more of the name. */
export const MEMBER_PICKER_SIZE = 25

/** A member search as typed, made ready to send: trimmed and cut to core's longest `q` (none if blank). */
export function memberSearchTerm(text: string): string {
  return text.trim().slice(0, MAX_MEMBER_QUERY_LENGTH).trim()
}

/**
 * Members whose name matches `term` (core's `q`), the first page only; an empty term lists the
 * first ones. No request is made unless `enabled`.
 */
export function useMemberSearch(term: string, enabled: boolean, role?: Role) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const q = memberSearchTerm(term)
  const query = useQuery<ListMembersResponse>({
    queryKey: [...KEYS.members(organizationId), 'search', q, role ?? ''],
    queryFn: ({ signal }) =>
      app.core.listMembers({
        limit: MEMBER_PICKER_SIZE,
        q: q === '' ? undefined : q,
        role,
        signal,
      }),
    enabled: enabled && organizationId !== '',
    placeholderData: (previous) => previous,
  })
  return { items: query.data?.items ?? [], hasMore: Boolean(query.data?.nextCursor) }
}

/** The most member ids core resolves in one call. */
const MEMBER_IDS_PER_CALL = MAX_MEMBER_IDS

/**
 * The names of specific members by id, resolved with `ids=` calls of at most 100 each (core's
 * limit), so a name shows even when the member is not on the first page of a list. Returns a map
 * from id to the member; an id core does not list is absent.
 */
export function useMembersByIds(ids: readonly string[], enabled = true) {
  return useMembersByIdsState(ids, enabled).members
}

/** Like `useMembersByIds`, and says whether a lookup is still under way (`loading`). */
export function useMembersByIdsState(ids: readonly string[], enabled = true) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const wanted = [...new Set(ids)].sort()
  const query = useQuery<ReadonlyMap<string, ListMembersResponse['items'][number]>>({
    queryKey: [...KEYS.members(organizationId), 'ids', wanted],
    queryFn: async ({ signal }) => {
      const found = new Map<string, ListMembersResponse['items'][number]>()
      for (let at = 0; at < wanted.length; at += MEMBER_IDS_PER_CALL) {
        const chunk = wanted.slice(at, at + MEMBER_IDS_PER_CALL)
        const result = await app.core.listMembers({
          limit: MEMBER_IDS_PER_CALL,
          ids: chunk,
          signal,
        })
        for (const member of result.items) {
          found.set(member.id, member)
        }
      }
      return found
    },
    enabled: enabled && organizationId !== '' && wanted.length > 0,
    placeholderData: (previous) => previous,
  })
  return {
    members: query.data ?? new Map<string, ListMembersResponse['items'][number]>(),
    // Only while there is no answer for these ids yet: a refetch keeps what was resolved.
    failed: query.isError,
    loading: query.isLoading || (query.isFetching && query.isPlaceholderData),
  }
}

/** The Contact Consent state of one Prospect, every channel. */
export function useProspectConsent(prospectId: string) {
  const app = useApp()
  const organizationId = useOrganizationId()
  return useQuery({
    queryKey: [...KEYS.consent(organizationId), 'state', prospectId],
    queryFn: ({ signal }) => app.consent.getProspectConsent(prospectId, signal),
    enabled: organizationId !== '',
    retry: false,
  })
}

/** The consent ledger of one Prospect, newest first, a page at a time. */
export function useConsentEvents(prospectId: string) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const query = useInfiniteQuery<
    ConsentEventsPage,
    Error,
    InfiniteData<ConsentEventsPage, string | undefined>,
    readonly unknown[],
    string | undefined
  >({
    queryKey: [...KEYS.consent(organizationId), 'events', prospectId],
    queryFn: ({ pageParam, signal }) =>
      app.consent.listConsentEvents(prospectId, { cursor: pageParam, signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: organizationId !== '',
    retry: false,
  })
  return pagedState(query)
}

/** The most pages of Consent Wordings the record form reads, so a long history stays bounded. */
export const WORDING_PAGES = 4

/** The Consent Wordings of the Organization, newest page first, up to `WORDING_PAGES` pages. */
export function useConsentWordings(enabled: boolean) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const query = useInfiniteQuery<
    ConsentWordingsPage,
    Error,
    InfiniteData<ConsentWordingsPage, string | undefined>,
    readonly unknown[],
    string | undefined
  >({
    queryKey: [...KEYS.consent(organizationId), 'wordings'],
    queryFn: ({ pageParam, signal }) =>
      app.consent.listConsentWordings({ cursor: pageParam, signal, limit: MAX_PAGE_SIZE }),
    initialPageParam: undefined,
    getNextPageParam: (last, pages) =>
      pages.length >= WORDING_PAGES ? undefined : (last.nextCursor ?? undefined),
    enabled: enabled && organizationId !== '',
    retry: false,
  })
  return pagedState(query)
}

/** The Suppression entries that match the filters, a page at a time. `enabled` is false for a role that may not list them. */
export function useSuppressionEntries(filter: SuppressionFilter, enabled: boolean) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const query = useInfiniteQuery<
    SuppressionPage,
    Error,
    InfiniteData<SuppressionPage, string | undefined>,
    readonly unknown[],
    string | undefined
  >({
    queryKey: [...KEYS.suppression(organizationId), filter],
    queryFn: ({ pageParam, signal }) =>
      app.consent.listSuppressionEntries({ ...filter, cursor: pageParam, signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: enabled && organizationId !== '',
  })
  return pagedState(query)
}
