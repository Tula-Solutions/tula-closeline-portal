import type { ReactNode, Ref } from 'react'

/** The top of a result list: the "Results" heading (focused when the answer arrives) and what the search looked at. */
export function ResultsHeader(props: {
  readonly id: string
  readonly headingRef: Ref<HTMLHeadingElement>
  readonly evidence?: ReactNode
}) {
  return (
    <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-rule-strong pt-4'>
      <h2 id={props.id} tabIndex={-1} ref={props.headingRef} className='m-0 outline-hidden'>
        Results
      </h2>
      {props.evidence}
    </div>
  )
}

/** The position of a result in its list, as a two-digit mono numeral. */
export function Rank(props: { readonly n: number }) {
  return (
    <span
      aria-hidden='true'
      className='shrink-0 font-mono text-xs text-muted-foreground tabular-nums'
    >
      {String(props.n).padStart(2, '0')}
    </span>
  )
}
