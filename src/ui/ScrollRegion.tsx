import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

/**
 * A ledger's scroll box, with the heavy rule on top: a named region the keyboard can reach and
 * scroll. `bare` drops the rule, for a table that sits under a section whose header draws one.
 */
export function ScrollRegion(props: {
  readonly label: string
  readonly children: ReactNode
  readonly bare?: boolean
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a div with a region role is how a scroll box is named
    <div
      className={cn(
        // `relative` makes the box the containing block of sr-only cells, so they scroll with it
        // instead of widening the page on a phone.
        'table-scroll relative motion-safe:animate-fade',
        props.bare ? 'border-t-0' : null
      )}
      role='region'
      aria-label={props.label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard
      tabIndex={0}
    >
      {props.children}
    </div>
  )
}
