import {
  type InfiniteData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { TranscriptPage, VoiceCall } from 'tula-closeline-contract'
import type { CallFilters, CallPage } from '~/api/call-history'
import { useApp } from '~/app-context'
import { pagedState, pagedStateBy, useOrganizationId } from '~/data/queries'

const callsKey = (organizationId: string) => [organizationId, 'voice-calls'] as const

/** The Calls the caller may see, a page at a time; core's voice scopes them to the role. */
export function useCallHistory(filters: CallFilters) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const query = useInfiniteQuery<
    CallPage,
    Error,
    InfiniteData<CallPage, string | undefined>,
    readonly unknown[],
    string | undefined
  >({
    queryKey: [...callsKey(organizationId), 'list', filters],
    queryFn: ({ pageParam, signal }) =>
      app.callHistory.list(filters, { cursor: pageParam, signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: organizationId !== '',
  })
  return pagedState(query)
}

/** One Call; `store` writes an answered Call (wrap-up, deleted Recording) into the cache. */
export function useCall(callId: string) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const client = useQueryClient()
  const key = [...callsKey(organizationId), 'one', callId]
  const query = useQuery<VoiceCall>({
    queryKey: key,
    queryFn: ({ signal }) => app.callHistory.get(callId, signal),
    enabled: organizationId !== '',
  })
  return {
    query,
    store: (call: VoiceCall) => {
      client.setQueryData(key, call)
      void client.invalidateQueries({ queryKey: [...callsKey(organizationId), 'list'] })
      void client.invalidateQueries({
        queryKey: [...callsKey(organizationId), 'transcript', callId],
      })
    },
  }
}

/** The Transcript turns of a Call, a page at a time; no request until `enabled`. */
export function useTranscript(callId: string, enabled: boolean) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const query = useInfiniteQuery<
    TranscriptPage,
    Error,
    InfiniteData<TranscriptPage, string | undefined>,
    readonly unknown[],
    string | undefined
  >({
    queryKey: [...callsKey(organizationId), 'transcript', callId],
    queryFn: ({ pageParam, signal }) =>
      app.callHistory.transcript(callId, { cursor: pageParam, signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: enabled && organizationId !== '',
  })
  const paged = pagedStateBy(query, (turn) => `${turn.startMs}-${turn.speaker}`)
  return { ...paged, transcriptState: query.data?.pages[0]?.state }
}
