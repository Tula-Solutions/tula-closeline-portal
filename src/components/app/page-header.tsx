import type { ComponentProps, ReactNode, Ref } from 'react'
import { cn } from '~/lib/utils'

/**
 * The top of every page: the title (the page's one h1), a line saying what the page is for, and
 * the primary action on the right. `headingRef` lets a page move focus to its title.
 */
export function PageHeader(props: {
  readonly title: ReactNode
  readonly description?: ReactNode
  readonly actions?: ReactNode
  readonly headingRef?: Ref<HTMLHeadingElement>
  readonly headingProps?: ComponentProps<'h1'>
  readonly className?: string
}) {
  return (
    <header
      className={cn(
        'mb-8 flex flex-wrap items-start justify-between gap-x-6 gap-y-4',
        props.className
      )}
    >
      <div className='min-w-0 flex-1 basis-80'>
        <h1
          ref={props.headingRef}
          {...props.headingProps}
          className='text-2xl font-semibold tracking-tight text-balance outline-none md:text-3xl'
        >
          {props.title}
        </h1>
        {props.description ? (
          <p className='mt-2 max-w-prose text-sm text-muted-foreground md:text-base'>
            {props.description}
          </p>
        ) : null}
      </div>
      {props.actions ? (
        <div className='flex flex-wrap items-center gap-2'>{props.actions}</div>
      ) : null}
    </header>
  )
}
