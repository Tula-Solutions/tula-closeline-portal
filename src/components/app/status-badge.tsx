import { Badge, BadgeDot } from '~/components/ui/badge'

type Tone = {
  readonly variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
  /** A state that is still moving: its dot pulses. */
  readonly live?: boolean
}

/** The colour of each state or Outcome word; colour is never the only signal because the label is always shown. */
const TONES: Record<string, Tone> = {
  ready: { variant: 'success' },
  completed: { variant: 'success' },
  won: { variant: 'success' },
  failed: { variant: 'danger' },
  lost: { variant: 'danger' },
  processing: { variant: 'info', live: true },
  transcribing: { variant: 'info', live: true },
  uploaded: { variant: 'info' },
  awaiting_rep: { variant: 'warning' },
  open: { variant: 'neutral' },
  deleted: { variant: 'neutral' },
}

/** A state or Outcome as a badge: a dot and the words. A state this build does not know is neutral. */
export function StatusBadge(props: { readonly state: string; readonly children: string }) {
  const tone = Object.hasOwn(TONES, props.state) ? TONES[props.state] : undefined
  return (
    <Badge variant={tone?.variant ?? 'neutral'} data-state={props.state}>
      <BadgeDot live={tone?.live === true} />
      {props.children}
    </Badge>
  )
}
