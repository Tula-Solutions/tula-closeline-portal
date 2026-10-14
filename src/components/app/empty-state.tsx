import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

/** What a list shows when it has nothing yet: an icon, what is missing, and what to do about it. */
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
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center',
        props.className
      )}
    >
      <span className='flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground'>
        <Icon aria-hidden='true' className='size-6' />
      </span>
      <p className='text-base font-semibold'>{props.title}</p>
      {props.children ? (
        <p className='max-w-md text-sm text-muted-foreground'>{props.children}</p>
      ) : null}
      {props.action ? <div className='mt-1'>{props.action}</div> : null}
    </div>
  )
}
