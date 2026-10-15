import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

/**
 * What a list shows when it has nothing yet: one line in the serif saying what is missing, one
 * plain sentence of help and, when there is one, the link that adds the first. Left-aligned on the
 * rule, with no box and no icon.
 */
export function EmptyState(props: {
  readonly title: string
  readonly children?: ReactNode
  readonly action?: ReactNode
  readonly className?: string
}) {
  return (
    <div
      data-slot='empty-state'
      className={cn('border-t pt-6 pb-2 motion-safe:animate-fade', props.className)}
    >
      <p className='m-0 font-serif text-2xl leading-tight tracking-[-0.012em]'>{props.title}</p>
      {props.children ? (
        <p className='mt-2 mb-0 max-w-[60ch] text-sm text-muted-foreground'>{props.children}</p>
      ) : null}
      {props.action ? <div className='mt-4'>{props.action}</div> : null}
    </div>
  )
}
