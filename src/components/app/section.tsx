import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

/**
 * A titled panel of a page: a raised card with a header (an optional icon, the title as an h2, a
 * line of help and actions on the right) and its content. Used to group a form ("Invite someone")
 * or a list ("Pending Invitations"). The heading names the region.
 */
export function Section(props: {
  readonly id: string
  readonly title: ReactNode
  readonly description?: ReactNode
  readonly icon?: LucideIcon
  readonly actions?: ReactNode
  readonly children: ReactNode
  /** `flush` drops the body padding, for a table that runs to the card's edges. */
  readonly flush?: boolean
  readonly className?: string
}) {
  const Icon = props.icon
  const headingId = `${props.id}-heading`
  return (
    <section
      aria-labelledby={headingId}
      data-slot='section'
      className={cn(
        'min-w-0 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-elev-1',
        props.className
      )}
    >
      <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-5 py-4'>
        <div className='flex min-w-0 items-center gap-3'>
          {Icon ? (
            <span
              aria-hidden='true'
              className='flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'
            >
              <Icon className='size-4' />
            </span>
          ) : null}
          <div className='min-w-0'>
            <h2 id={headingId} className='m-0 text-[0.9375rem] font-semibold tracking-[-0.011em]'>
              {props.title}
            </h2>
            {props.description ? (
              <p className='m-0 mt-0.5 text-[0.8125rem] text-muted-foreground'>
                {props.description}
              </p>
            ) : null}
          </div>
        </div>
        {props.actions ? (
          <div className='flex flex-wrap items-center gap-2'>{props.actions}</div>
        ) : null}
      </div>
      <div className={props.flush ? undefined : 'p-5'}>{props.children}</div>
    </section>
  )
}
