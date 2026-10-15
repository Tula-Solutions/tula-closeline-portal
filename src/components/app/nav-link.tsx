import { Link, type LinkProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'

// Text navigation. The page you are on is set in ink and marked by a short rule in the margin;
// the others are quieter. No icons and no filled rows: the type does the work.
const BASE =
  "relative block rounded-sm py-1.5 pl-4 text-[0.9375rem] text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring before:absolute before:top-1/2 before:left-0 before:h-px before:w-2.5 before:bg-foreground before:opacity-0 before:transition-opacity before:content-[''] aria-[current=page]:font-medium aria-[current=page]:text-foreground aria-[current=page]:before:opacity-100 pointer-coarse:py-2.5"

/** A link of the sidebar, set as text; on its own page it is in ink with a rule in the margin. */
export function NavLink(props: {
  readonly to: LinkProps['to']
  readonly exact?: boolean
  readonly children: ReactNode
}) {
  return (
    <Link to={props.to} activeOptions={{ exact: props.exact === true }} className={BASE}>
      {props.children}
    </Link>
  )
}

/** A link inside an open section of the sidebar, indented under its section and a size smaller. */
export function SubNavLink(props: {
  readonly to: LinkProps['to']
  readonly exact?: boolean
  readonly children: ReactNode
}) {
  return (
    <Link
      to={props.to}
      activeOptions={{ exact: props.exact === true }}
      className='block rounded-sm py-1 pl-7 text-[0.8125rem] text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:font-medium aria-[current=page]:text-foreground pointer-coarse:py-2.5'
    >
      {props.children}
    </Link>
  )
}

/** A labelled group of sidebar links ("Organization", "Sales"). The label names the group for assistive technology. */
export function NavGroup(props: {
  readonly id: string
  readonly label: string
  readonly children: ReactNode
}) {
  const labelId = `nav-group-${props.id}`
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset is for form controls; this groups links
    <div role='group' aria-labelledby={labelId} className='flex flex-col'>
      <span id={labelId} className='label-mono pt-6 pb-2 pl-4'>
        {props.label}
      </span>
      {props.children}
    </div>
  )
}
