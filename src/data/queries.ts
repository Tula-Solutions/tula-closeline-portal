import { type InfiniteData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type {
  CallState,
  DocumentState,
  ListDealImportRowsResponse,
  ListDealImportsResponse,
  ListDealsResponse,
  ListDocumentsResponse,
  ListInvitationsResponse,
  ListMembersResponse,
  ListTeamsResponse,
  Outcome,
} from 'tula-closeline-contract'
import type { CallsPage } from '~/api/sales-history'
import type { App } from '~/app'
import { useApp, useSessionState } from '~/app-context'
import type { PagedState } from '~/ui/Paged'

/** Query keys, one place so a mutation can refresh exactly what it changed. */
export const KEYS = {
  members: (organizationId: string) => [organizationId, 'members'] as const,
  invitations: (organizationId: string) => [organizationId, 'invitations'] as const,
  teams: (organizationId: string) => [organizationId, 'teams'] as const,
  /** Every list of documents of the Organization, whatever its state filter: invalidate this to refresh them all. */
  documents: (organizationId: string) => [organizationId, 'documents'] as const,
  /** Every cached read about Deals (lists and single Deals): invalidate this after an Outcome changes. */
  deals: (organizationId: string) => [organizationId, 'deals'] as const,
  /** Every cached read about Deal imports (lists, single imports and reports). */
  dealImports: (organizationId: string) => [organizationId, 'deal-imports'] as const,
  /** Every cached list of Calls, whatever its filters. */
  calls: (organizationId: string) => [organizationId, 'calls'] as const,
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
