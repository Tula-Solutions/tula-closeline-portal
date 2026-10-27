import { useEffect, useRef } from 'react'
import { cn } from '~/lib/utils'
import { EASE, play } from '~/ui/motion'

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

/** The colour of each state's or Outcome's dot; colour is never the only signal because the word is always shown. */
const TONES: Record<string, Tone> = {
  ready: 'success',
  completed: 'success',
  won: 'success',
  failed: 'danger',
  lost: 'danger',
  processing: 'info',
  running: 'info',
  queued: 'neutral',
  expired: 'warning',
  transcribing: 'info',
  uploaded: 'info',
  awaiting_rep: 'warning',
  agent: 'info',
  awaiting_approval: 'warning',
  escalated: 'danger',
  open: 'neutral',
  deleted: 'neutral',
}

/** States where work is under way: their dot breathes slowly until the work ends. */
const BUSY = new Set(['processing', 'transcribing', 'uploaded'])

const DOT: Record<Tone, string> = {
  neutral: 'bg-muted-foreground',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
}

function toneOf(state: string): Tone {
  return Object.hasOwn(TONES, state) ? (TONES[state] ?? 'neutral') : 'neutral'
}

/**
 * A state or Outcome as set text: a small dot in its colour and the word. A state this build does
 * not know is neutral. The dot breathes while work is under way, and when a shown state turns into a
 * finished one a ring pulses out of it once; under reduced motion it only changes colour.
 */
export function StatusBadge(props: { readonly state: string; readonly children: string }) {
  const tone = toneOf(props.state)
  const ring = useRef<HTMLSpanElement>(null)
  const before = useRef(props.state)
  useEffect(() => {
    const was = before.current
    before.current = props.state
    if (was !== props.state && toneOf(props.state) === 'success') {
      play(
        ring.current,
        [
          { transform: 'scale(1)', opacity: 0.6 },
          { transform: 'scale(2.4)', opacity: 0 },
        ],
        { duration: 600, easing: EASE.out }
      )
    }
  }, [props.state])
  return (
    <span
      data-slot='status'
      data-state={props.state}
      className='inline-flex items-center gap-2 text-[0.8125rem] whitespace-nowrap'
    >
      <span
        aria-hidden='true'
        data-slot='status-dot'
        className={cn(
          'relative size-1.5 rounded-full transition-colors duration-300',
          DOT[tone],
          BUSY.has(props.state) && 'status-busy'
        )}
      >
        <span ref={ring} className={cn('absolute inset-0 rounded-full opacity-0', DOT[tone])} />
      </span>
      {props.children}
    </span>
  )
}
