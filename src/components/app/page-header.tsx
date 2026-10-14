import type { LucideIcon } from 'lucide-react'
import type { ComponentProps, ReactNode, Ref } from 'react'
import { cn } from '~/lib/utils'

/**
 * The top of every page: an optional icon tile and eyebrow (the section a sub-page belongs to),
 * the title (the page's one h1), a line saying what the page is for, and the primary actions on
 * the right. `headingRef` lets a page move focus to its title.
 */
export function PageHeader(props: {
  readonly title: ReactNode
  readonly description?: ReactNode
  readonly actions?: ReactNode
  readonly icon?: LucideIcon
  readonly eyebrow?: ReactNode
  readonly headingRef?: Ref<HTMLHeadingElement>
  readonly headingProps?: ComponentProps<'h1'>
  readonly className?: string
}) {
  const Icon = props.icon
  return (
    <header
      data-slot='page-header'
      className={cn(
        'mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 motion-safe:animate-rise',
        props.className
      )}
    >
      <div className='flex min-w-0 flex-1 basis-80 items-start gap-4'>
        {Icon ? (
          <span
            aria-hidden='true'
            className='mt-0.5 hidden size-11 shrink-0 items-center justify-center rounded-xl border bg-card text-primary shadow-elev-1 sm:flex'
          >
            <Icon className='size-5' strokeWidth={1.75} />
          </span>
        ) : null}
        <div className='min-w-0'>
          {props.eyebrow ? (
            <p className='mb-1 text-xs font-semibold text-muted-foreground'>{props.eyebrow}</p>
          ) : null}
          <h1
            ref={props.headingRef}
            {...props.headingProps}
            className='m-0 text-2xl leading-tight font-semibold tracking-[-0.022em] text-balance outline-none md:text-[1.75rem]'
          >
            {props.title}
          </h1>
          {props.description ? (
            <p className='mt-1.5 mb-0 max-w-[65ch] text-sm leading-relaxed text-muted-foreground md:text-[0.9375rem]'>
              {props.description}
            </p>
          ) : null}
        </div>
      </div>
      {props.actions ? (
        <div className='flex flex-wrap items-center gap-2'>{props.actions}</div>
      ) : null}
    </header>
  )
}
