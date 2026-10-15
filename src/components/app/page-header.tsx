import type { ComponentProps, ReactNode, Ref } from 'react'
import { cn } from '~/lib/utils'

/**
 * The top of every page, set like a broadsheet: a small mono label for the section a sub-page
 * belongs to, the title large in the serif (the page's one h1), a line saying what the page is
 * for, and the primary actions on the right. The content's own rule closes it off. `headingRef` lets a page
 * move focus to its title.
 */
export function PageHeader(props: {
  readonly title: ReactNode
  readonly description?: ReactNode
  readonly actions?: ReactNode
  readonly eyebrow?: ReactNode
  readonly headingRef?: Ref<HTMLHeadingElement>
  readonly headingProps?: ComponentProps<'h1'>
  readonly className?: string
}) {
  return (
    <header
      data-slot='page-header'
      className={cn(
        'mb-12 flex flex-wrap items-end justify-between gap-x-8 gap-y-5 motion-safe:animate-rise',
        props.className
      )}
    >
      <div className='min-w-0 flex-1 basis-96'>
        {props.eyebrow ? <p className='label-mono mb-3'>{props.eyebrow}</p> : null}
        <h1
          ref={props.headingRef}
          {...props.headingProps}
          className='m-0 font-serif text-[2.5rem] leading-[1.02] font-normal tracking-[-0.022em] text-balance outline-hidden md:text-[3.25rem]'
        >
          {props.title}
        </h1>
        {props.description ? (
          <p className='mt-3 mb-0 max-w-[62ch] text-[0.9375rem] leading-relaxed text-muted-foreground'>
            {props.description}
          </p>
        ) : null}
      </div>
      {props.actions ? (
        <div className='flex flex-wrap items-center gap-3'>{props.actions}</div>
      ) : null}
    </header>
  )
}
