import type { ReactNode } from 'react'

/** A table's frame and its scroll box on a narrow screen: a named region the keyboard can reach and scroll. */
export function ScrollRegion(props: { readonly label: string; readonly children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a div with a region role is how a scroll box is named
    <div
      className='table-scroll overflow-x-auto rounded-xl border bg-card shadow-xs'
      role='region'
      aria-label={props.label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard
      tabIndex={0}
    >
      {props.children}
    </div>
  )
}
