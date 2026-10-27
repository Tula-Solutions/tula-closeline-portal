import type { ReactNode, Ref } from 'react'
import { play, reveal } from '~/ui/motion'

/**
 * Brings a list of results in: the heading's rule draws across (220 ms), then each result rises
 * 6 px, 50 ms apart (only the first five are staggered). Under reduced motion they are simply there.
 */
export function revealResults(list: HTMLElement | null): void {
  if (list === null) {
    return
  }
  const rule = list.closest('section')?.firstElementChild
  play(rule, [{ backgroundSize: '0% 1px' }, { backgroundSize: '100% 1px' }], {
    duration: 220,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  })
  reveal(list.children, { delay: 80, step: 50, max: 5, rise: '6px', duration: 320 })
}

/** The top of a result list: the "Results" heading (focused when the answer arrives) and what the search looked at. */
export function ResultsHeader(props: {
  readonly id: string
  readonly headingRef: Ref<HTMLHeadingElement>
  readonly evidence?: ReactNode
}) {
  return (
    <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-[linear-gradient(var(--rule-strong),var(--rule-strong))] bg-size-[100%_1px] bg-top-left bg-no-repeat pt-4 forced-colors:border-t'>
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
