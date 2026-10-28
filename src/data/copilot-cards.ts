import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import type { CopilotCard, MarkCopilotCardRequest } from 'tula-closeline-contract'
import type { CardKind, CardsPage } from '~/api/voice'
import { useApp } from '~/app-context'
import { pagedState, useOrganizationId } from '~/data/queries'

type Cards = InfiniteData<CardsPage, string | undefined>

/** The card state a change asks for; dismissing clears the pin and pinning clears the dismissal, as the service does. */
function applied(card: CopilotCard, body: MarkCopilotCardRequest): CopilotCard {
  return {
    ...card,
    ...(body.rating !== undefined ? { rating: body.rating } : {}),
    ...(body.dismissed !== undefined ? { dismissed: body.dismissed } : {}),
    ...(body.pinned !== undefined ? { pinned: body.pinned } : {}),
    ...(body.dismissed ? { pinned: false } : {}),
    ...(body.pinned ? { dismissed: false } : {}),
  }
}

/**
 * A Call's Copilot cards, a page at a time, and `mark`, which changes a card at once on screen and
 * puts that card's old state back (and calls `onFailure`) if the service refuses (the answer is the card as stored).
 */
export function useCopilotCards(
  callId: string,
  kind: CardKind | undefined,
  onFailure?: (error: Error) => void
) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const client = useQueryClient()
  const root = [organizationId, 'voice-calls', 'cards', callId] as const
  const key = [...root, kind ?? 'all'] as const
  const query = useInfiniteQuery<CardsPage, Error, Cards, readonly unknown[], string | undefined>({
    queryKey: key,
    queryFn: ({ pageParam, signal }) =>
      app.voice.listCopilotCards(callId, kind, { cursor: pageParam, signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: organizationId !== '',
  })
  const patch = (data: Cards | undefined, card: CopilotCard): Cards | undefined =>
    data && {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.map((item) => (item.id === card.id ? card : item)),
      })),
    }
  const mark = useMutation({
    mutationFn: (change: { card: CopilotCard; body: MarkCopilotCardRequest }) =>
      app.voice.markCopilotCard(callId, change.card.id, change.body),
    onMutate: async ({ card, body }) => {
      await client.cancelQueries({ queryKey: root })
      const next = applied(card, body)
      client.setQueriesData<Cards>({ queryKey: root }, (data) => patch(data, next))
    },
    // Only the failed card goes back, so another mark still in flight keeps its change.
    onError: (error, { card }) => {
      client.setQueriesData<Cards>({ queryKey: root }, (data) => patch(data, card))
      onFailure?.(error)
    },
    onSuccess: (card) =>
      client.setQueriesData<Cards>({ queryKey: root }, (data) => patch(data, card)),
  })
  return { ...pagedState(query), mark }
}
