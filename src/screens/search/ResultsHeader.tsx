import type { ReactNode, Ref } from 'react'

/** The top of a result list: the "Results" heading (focused when the answer arrives) and what the search looked at. */
export function ResultsHeader(props: {
  readonly id: string
  readonly headingRef: Ref<HTMLHeadingElement>
  readonly evidence?: ReactNode
}) {
  return (
    <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'>
      <h2
        id={props.id}
        tabIndex={-1}
        ref={props.headingRef}
        className='m-0 text-[0.9375rem] font-semibold tracking-[-0.011em]'
      >
        Results
      </h2>
      {props.evidence}
    </div>
  )
}

/** The position of a result in its list, as a small numbered chip. */
export function Rank(props: { readonly n: number }) {
  return (
    <span
      aria-hidden='true'
      className='flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground text-[0.6875rem] font-semibold text-background tabular-nums'
    >
      {props.n}
    </span>
  )
}
