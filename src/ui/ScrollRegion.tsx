import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

/**
 * A table's frame and its scroll box: a named region the keyboard can reach and scroll. `bare`
 * drops the card frame, for a table that sits inside a panel which already draws one.
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
        'table-scroll motion-safe:animate-fade',
        props.bare ? null : 'rounded-xl border bg-card shadow-elev-1'
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
