import { cn } from '~/lib/utils'

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

const DOT: Record<Tone, string> = {
  neutral: 'bg-muted-foreground',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
}

/** A state or Outcome as set text: a small dot in its colour and the word. A state this build does not know is neutral. */
export function StatusBadge(props: { readonly state: string; readonly children: string }) {
  const tone = Object.hasOwn(TONES, props.state) ? (TONES[props.state] ?? 'neutral') : 'neutral'
  return (
    <span
      data-slot='status'
      data-state={props.state}
      className='inline-flex items-center gap-2 text-[0.8125rem] whitespace-nowrap'
    >
      <span
        aria-hidden='true'
        data-slot='status-dot'
        className={cn('size-1.5 rounded-full', DOT[tone])}
      />
      {props.children}
    </span>
  )
}
