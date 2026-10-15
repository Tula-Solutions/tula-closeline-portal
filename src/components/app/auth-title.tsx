import type { ReactNode, Ref } from 'react'

/** The heading of a sign-in or sign-up step, in the serif, and the line under it. `headingRef` lets the step move focus to it. */
export function AuthTitle(props: {
  readonly children: ReactNode
  readonly description?: ReactNode
  readonly headingRef?: Ref<HTMLHeadingElement>
  readonly focusable?: boolean
}) {
  return (
    <div className='mb-8'>
      <h1
        ref={props.headingRef}
        tabIndex={props.focusable ? -1 : undefined}
        className='font-serif text-[2.25rem] leading-[1.05] font-normal tracking-[-0.02em] outline-hidden'
      >
        {props.children}
      </h1>
      {props.description ? (
        <p className='mt-3 text-[0.9375rem] text-muted-foreground'>{props.description}</p>
      ) : null}
    </div>
  )
}
