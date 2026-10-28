import { useCallback, useRef, useState } from 'react'
import type {
  CopilotCard,
  CopilotStreamMessage,
  MarkCopilotCardRequest,
} from 'tula-closeline-contract'
import { presentCallHistory } from '~/api/voice-messages'
import { useApp } from '~/app-context'
import { applied } from '~/data/copilot-cards'
import { CardRow } from '~/screens/calls/CopilotCards'
import { Banner } from '~/ui/Banner'
import { LiveTranscript } from './LiveTranscript'

type Quiet = Extract<CopilotStreamMessage, { event: 'copilot.status' }>['data']['quietReason']
type Why = Quiet | 'off' | 'ended'

/** Why the panel is empty, in words; only what the service said is stated, and without a reason it does not guess. */
const EMPTY_WORDS: Record<NonNullable<Why> | 'unknown', string> = {
  off: 'The Copilot is off for this Call, so it shows no cards.',
  not_enough_won_moments: 'The Playbook does not have enough won Moments that match this Call yet.',
  playbook_unavailable:
    'The Playbook could not be reached, so there are no cards for now. The Call is not affected.',
  transcript_unavailable:
    'Without a Transcript the Copilot has nothing to match. The Call is not affected.',
  ended: 'The Call is over. The Copilot showed no cards.',
  unknown: 'No cards yet. One appears when the Playbook has won Moments that match what is said.',
}

/** Pinned cards first, then the newest; a dismissed card is out of the way. */
function order(cards: readonly CopilotCard[]): CopilotCard[] {
  return cards
    .filter((card) => !card.dismissed)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.sequence - a.sequence)
}

/** The live side of a Copilot Call: the Copilot cards as they arrive, above the live Transcript, both fed by one stream. */
export function CallCopilot(props: { readonly callId: string }) {
  const app = useApp()
  const [cards, setCards] = useState<readonly CopilotCard[]>([])
  const [why, setWhy] = useState<Why>(null)
  const [error, setError] = useState<string | null>(null)

  const onMessage = useCallback((message: CopilotStreamMessage) => {
    if (message.event === 'copilot.status') {
      setWhy(message.data.state === 'ended' ? 'ended' : message.data.quietReason)
    } else if (message.event === 'copilot.card' || message.event === 'copilot.card_updated') {
      const { card } = message.data
      // A replayed `copilot.card` must not undo a mark made since; only `card_updated` replaces.
      setCards((now) =>
        now.some((c) => c.id === card.id)
          ? message.event === 'copilot.card_updated'
            ? now.map((c) => (c.id === card.id ? card : c))
            : now
          : [...now, card]
      )
    }
  }, [])
  const onOff = useCallback(() => setWhy('off'), [])

  const replace = (card: CopilotCard) =>
    setCards((now) => now.map((c) => (c.id === card.id ? card : c)))
  // The newest mark sent per card; an older answer must not overwrite what a newer press shows.
  const latest = useRef(new Map<string, number>())
  // The service holds the end state, so a repeat of a press changes nothing. A refusal undoes only
  // the fields that press touched, on the card as it is now, so another press in flight stays.
  const mark = (card: CopilotCard, body: MarkCopilotCardRequest) => {
    setError(null)
    const sent = (latest.current.get(card.id) ?? 0) + 1
    latest.current.set(card.id, sent)
    replace(applied(card, body))
    app.voice.markCopilotCard(props.callId, card.id, body).then(
      (stored) => {
        if (latest.current.get(card.id) === sent) {
          replace(stored)
        }
      },
      (failure: unknown) => {
        setCards((now) =>
          now.map((c) =>
            c.id === card.id
              ? {
                  ...c,
                  ...(body.rating !== undefined ? { rating: card.rating } : {}),
                  ...(body.dismissed !== undefined || body.pinned
                    ? { dismissed: card.dismissed }
                    : {}),
                  ...(body.pinned !== undefined || body.dismissed ? { pinned: card.pinned } : {}),
                }
              : c
          )
        )
        setError(presentCallHistory(failure).message)
      }
    )
  }

  const shown = order(cards)
  return (
    <>
      <section aria-label='Copilot cards' className='lg:col-span-2 border-t pt-4'>
        <h3 className='label-mono'>Copilot cards</h3>
        {error ? <Banner kind='error'>{error}</Banner> : null}
        {shown.length === 0 ? (
          <p className='mt-3 text-sm text-muted-foreground'>
            {cards.length > 0 ? 'Every card was dismissed.' : EMPTY_WORDS[why ?? 'unknown']}
          </p>
        ) : (
          <ol className='m-0 mt-3 list-none divide-y border-y p-0'>
            {shown.map((card) => (
              <CardRow key={card.id} card={card} canMark onChange={(body) => mark(card, body)} />
            ))}
          </ol>
        )}
      </section>
      <LiveTranscript callId={props.callId} onMessage={onMessage} onOff={onOff} />
    </>
  )
}
