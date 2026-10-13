import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query'
import type {
  ListInvitationsResponse,
  ListMembersResponse,
  ListTeamsResponse,
} from 'tula-closeline-contract'
import { useApp } from '~/app-context'
import type { PagedState } from '~/ui/Paged'

/** Query keys, one place so a mutation can refresh exactly what it changed. */
export const KEYS = {
  members: ['members'] as const,
  invitations: ['invitations'] as const,
  teams: ['teams'] as const,
}

type Page<T> = { readonly items: readonly T[]; readonly nextCursor: string | null }

function pagedState<T>(query: {
  isPending: boolean
  isError: boolean
  error: unknown
  data: InfiniteData<Page<T>, string | undefined> | undefined
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => unknown
  refetch: () => unknown
}): { state: PagedState; items: readonly T[] } {
  const items = query.data?.pages.flatMap((page) => page.items) ?? []
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

/** The members, a page at a time. `enabled` is false for a role that may not list them (no request is made). */
export function useMembers(enabled: boolean) {
  const app = useApp()
  const query = useInfiniteQuery<
    ListMembersResponse,
    Error,
    InfiniteData<ListMembersResponse, string | undefined>,
    readonly string[],
    string | undefined
  >({
    queryKey: KEYS.members,
    queryFn: ({ pageParam, signal }) => app.core.listMembers({ cursor: pageParam, signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  })
  return pagedState(query)
}

/** The pending Invitations, a page at a time. */
export function useInvitations(enabled: boolean) {
  const app = useApp()
  const query = useInfiniteQuery<
    ListInvitationsResponse,
    Error,
    InfiniteData<ListInvitationsResponse, string | undefined>,
    readonly string[],
    string | undefined
  >({
    queryKey: KEYS.invitations,
    queryFn: ({ pageParam, signal }) => app.core.listInvitations({ cursor: pageParam, signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  })
  return pagedState(query)
}

/** The Teams, a page at a time. */
export function useTeams() {
  const app = useApp()
  const query = useInfiniteQuery<
    ListTeamsResponse,
    Error,
    InfiniteData<ListTeamsResponse, string | undefined>,
    readonly string[],
    string | undefined
  >({
    queryKey: KEYS.teams,
    queryFn: ({ pageParam, signal }) => app.core.listTeams({ cursor: pageParam, signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  return pagedState(query)
}
