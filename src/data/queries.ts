import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query'
import type {
  ListInvitationsResponse,
  ListMembersResponse,
  ListTeamsResponse,
} from 'tula-closeline-contract'
import type { App } from '~/app'
import { useApp, useSessionState } from '~/app-context'
import type { PagedState } from '~/ui/Paged'

/** Query keys, one place so a mutation can refresh exactly what it changed. */
export const KEYS = {
  members: (organizationId: string) => [organizationId, 'members'] as const,
  invitations: (organizationId: string) => [organizationId, 'invitations'] as const,
  teams: (organizationId: string) => [organizationId, 'teams'] as const,
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

function pagedState<T extends { readonly id: string }>(query: {
  isPending: boolean
  isError: boolean
  error: unknown
  data: InfiniteData<Page<T>, string | undefined> | undefined
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => unknown
  refetch: () => unknown
}): { state: PagedState; items: readonly T[] } {
  // A list can shift between pages (a row added or removed), so a row may come twice: show it once.
  const seen = new Set<string>()
  const items = (query.data?.pages.flatMap((page) => page.items) ?? []).filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
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
