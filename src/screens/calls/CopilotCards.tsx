import { Pin, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useState } from 'react'
import type { CopilotCard } from 'tula-closeline-contract'
import type { CardKind } from '~/api/voice'
import { presentCallHistory } from '~/api/voice-messages'
import { Button } from '~/components/ui/button'
import { useCopilotCards } from '~/data/copilot-cards'
import { Banner } from '~/ui/Banner'
import { Paged } from '~/ui/Paged'
import { SelectField } from '~/ui/SelectField'

const KIND_WORD: Record<CardKind, string> = {
  similar_moment: 'Similar Moment',
  objection: 'Objection',
  next_step: 'Next step',
  document: 'Document',
}

const KIND_OPTIONS = [
  { value: '', text: 'Any kind' },
  ...(Object.entries(KIND_WORD) as [CardKind, string][]).map(([value, text]) => ({ value, text })),
]

/** The words a card is about, by its kind. */
function headline(card: CopilotCard): string | null {
  switch (card.kind) {
    case 'objection':
      return `${card.objectionType}: ${card.response}`
    case 'next_step':
      return card.nextStep
    case 'document':
      return card.source.passage
    default:
      return null
  }
}

/** A Call's Copilot cards, oldest first, filtered by kind; the Rep who took the Call marks them, everyone else reads. */
export function CopilotCards(props: { readonly callId: string; readonly canMark: boolean }) {
  const [kind, setKind] = useState<CardKind | ''>('')
  const [error, setError] = useState<string | null>(null)
  const cards = useCopilotCards(props.callId, kind || undefined, (failure) =>
    setError(presentCallHistory(failure).message)
  )
  return (
    <>
      <div className='mb-4 max-w-xs'>
        <SelectField
          label='Kind'
          value={kind}
          options={KIND_OPTIONS}
          onChange={(event) => setKind(event.target.value as CardKind | '')}
        />
      </div>
      {error ? <Banner kind='error'>{error}</Banner> : null}
      <Paged
        noun='cards'
        emptyText={kind ? 'No cards of that kind.' : 'The Copilot showed no cards on this Call.'}
        state={cards.state}
        present={presentCallHistory}
      >
        <ol className='m-0 list-none divide-y border-y p-0' aria-label='Copilot cards'>
          {cards.items.map((card) => (
            <CardRow
              key={card.id}
              card={card}
              canMark={props.canMark}
              onChange={(body) => {
                setError(null)
                cards.mark.mutate({ card, body })
              }}
            />
          ))}
        </ol>
      </Paged>
    </>
  )
}

/** One card with its marks (useful, not useful, pin, dismiss) when the viewer may mark; each quote links to its source Call. */
export function CardRow(props: {
  readonly card: CopilotCard
  readonly canMark: boolean
  readonly onChange: (body: {
    rating?: 'useful' | 'not_useful' | null
    dismissed?: boolean
    pinned?: boolean
  }) => void
}) {
  const { card } = props
  const text = headline(card)
  return (
    <li data-row className={card.dismissed ? 'py-3 opacity-60' : 'py-3'}>
      <span className='label-mono block'>
        {KIND_WORD[card.kind]} · based on {card.evidence.moments} Moments from {card.evidence.deals}{' '}
        Deals
        {card.pinned ? ' · Pinned' : ''}
        {card.dismissed ? ' · Dismissed' : ''}
      </span>
      {text ? <p className='m-0'>{text}</p> : null}
      {card.quotes.map((quote) => (
        <blockquote key={`${quote.dealRecordId}-${quote.callId}`} className='m-0 mt-2 hint'>
          Prospect: {quote.prospect}
          <br />
          Rep next: {quote.repNext}
          <br />
          <a href={`/calls/${encodeURIComponent(quote.callId)}`} target='_blank' rel='noopener'>
            Source Call
          </a>
        </blockquote>
      ))}
      {props.canMark ? (
        <div className='row-actions mt-2'>
          <Button
            variant='outline'
            size='sm'
            aria-pressed={card.rating === 'useful'}
            onClick={() => props.onChange({ rating: card.rating === 'useful' ? null : 'useful' })}
          >
            <ThumbsUp aria-hidden='true' />
            Useful
          </Button>
          <Button
            variant='outline'
            size='sm'
            aria-pressed={card.rating === 'not_useful'}
            onClick={() =>
              props.onChange({ rating: card.rating === 'not_useful' ? null : 'not_useful' })
            }
          >
            <ThumbsDown aria-hidden='true' />
            Not useful
          </Button>
          <Button
            variant='outline'
            size='sm'
            aria-pressed={card.pinned}
            onClick={() => props.onChange({ pinned: !card.pinned })}
          >
            <Pin aria-hidden='true' />
            {card.pinned ? 'Unpin' : 'Pin'}
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => props.onChange({ dismissed: !card.dismissed })}
          >
            {card.dismissed ? 'Restore' : 'Dismiss'}
          </Button>
        </div>
      ) : card.rating ? (
        <p className='hint m-0 mt-1'>
          Rated {card.rating === 'useful' ? 'useful' : 'not useful'} by the Rep.
        </p>
      ) : null}
    </li>
  )
}
