import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

/**
 * What a list shows when it has nothing yet: an icon on a soft halo, what is missing, one line of
 * help, and the action that adds the first one.
 */
export function EmptyState(props: {
  readonly icon: LucideIcon
  readonly title: string
  readonly children?: ReactNode
  readonly action?: ReactNode
  readonly className?: string
}) {
  const Icon = props.icon
  return (
    <div
      data-slot='empty-state'
      className={cn(
        'relative flex flex-col items-center gap-2 overflow-hidden rounded-xl border border-dashed border-border-strong bg-card/70 px-6 py-14 text-center motion-safe:animate-fade',
        props.className
      )}
    >
      <span aria-hidden='true' className='relative mb-2 flex size-14 items-center justify-center'>
        <span className='absolute inset-0 rounded-2xl bg-primary/8 ring-1 ring-primary/10 -rotate-6' />
        <span className='relative flex size-12 items-center justify-center rounded-xl border bg-card text-primary shadow-elev-2'>
          <Icon className='size-5' strokeWidth={1.75} />
        </span>
      </span>
      <p className='m-0 text-[0.9375rem] font-semibold tracking-[-0.011em]'>{props.title}</p>
      {props.children ? (
        <p className='m-0 max-w-sm text-sm text-muted-foreground'>{props.children}</p>
      ) : null}
      {props.action ? <div className='mt-3'>{props.action}</div> : null}
    </div>
  )
}
