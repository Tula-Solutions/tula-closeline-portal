import {
  CheckCircle2,
  CircleDashed,
  CircleX,
  Clock,
  Loader,
  type LucideIcon,
  Trash2,
  Trophy,
  UserRoundSearch,
} from 'lucide-react'
import { Badge } from '~/components/ui/badge'

type Tone = {
  readonly variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
  readonly icon: LucideIcon
}

/** The colour and icon of each state or Outcome word; colour is never the only signal because the label is always shown. */
const TONES: Record<string, Tone> = {
  ready: { variant: 'success', icon: CheckCircle2 },
  completed: { variant: 'success', icon: CheckCircle2 },
  won: { variant: 'success', icon: Trophy },
  failed: { variant: 'danger', icon: CircleX },
  lost: { variant: 'danger', icon: CircleX },
  processing: { variant: 'info', icon: Loader },
  transcribing: { variant: 'info', icon: Loader },
  uploaded: { variant: 'info', icon: Clock },
  awaiting_rep: { variant: 'warning', icon: UserRoundSearch },
  open: { variant: 'neutral', icon: CircleDashed },
  deleted: { variant: 'neutral', icon: Trash2 },
}

/** A state or Outcome as a badge: an icon and the words. A state this build does not know is neutral. */
export function StatusBadge(props: { readonly state: string; readonly children: string }) {
  const tone = Object.hasOwn(TONES, props.state) ? TONES[props.state] : undefined
  const Icon = tone?.icon ?? CircleDashed
  return (
    <Badge variant={tone?.variant ?? 'neutral'}>
      <Icon aria-hidden='true' />
      {props.children}
    </Badge>
  )
}
