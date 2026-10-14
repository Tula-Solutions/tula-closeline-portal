import type { ReactNode, Ref } from 'react'

/** The heading of a sign-in or sign-up step and the line under it. `headingRef` lets the step move focus to it. */
export function AuthTitle(props: {
  readonly children: ReactNode
  readonly description?: ReactNode
  readonly headingRef?: Ref<HTMLHeadingElement>
  readonly focusable?: boolean
}) {
  return (
    <div className='mb-6'>
      <h1
        ref={props.headingRef}
        tabIndex={props.focusable ? -1 : undefined}
        className='text-2xl font-semibold tracking-tight outline-none'
      >
        {props.children}
      </h1>
      {props.description ? (
        <p className='mt-2 text-sm text-muted-foreground'>{props.description}</p>
      ) : null}
    </div>
  )
}
