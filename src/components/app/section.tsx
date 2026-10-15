import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

/**
 * A titled part of a page: a heavy rule, the title in the serif (an h2 that names the region), a
 * line of help, actions on the right, then the content on the paper. Used to group a form
 * ("Invite someone") or a list ("Pending Invitations").
 */
export function Section(props: {
  readonly id: string
  readonly title: ReactNode
  readonly description?: ReactNode
  readonly actions?: ReactNode
  readonly children: ReactNode
  /** `flush` puts the content straight under the header rule, for a ledger that draws its own. */
  readonly flush?: boolean
  readonly className?: string
}) {
  const headingId = `${props.id}-heading`
  return (
    <section
      aria-labelledby={headingId}
      data-slot='section'
      className={cn('m-0 min-w-0', props.className)}
    >
      <div className='flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t border-rule-strong pt-4 pb-5'>
        <div className='min-w-0'>
          <h2 id={headingId} className='m-0'>
            {props.title}
          </h2>
          {props.description ? (
            <p className='mt-1.5 mb-0 max-w-[60ch] text-sm text-muted-foreground'>
              {props.description}
            </p>
          ) : null}
        </div>
        {props.actions ? (
          <div className='flex flex-wrap items-center gap-4'>{props.actions}</div>
        ) : null}
      </div>
      <div className={props.flush ? '-mt-1' : undefined}>{props.children}</div>
    </section>
  )
}
