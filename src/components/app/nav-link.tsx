import { Link, type LinkProps } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

const BASE =
  "group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-sidebar-foreground/75 transition-[background-color,color,box-shadow] duration-150 ease-snappy outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-[3px] focus-visible:ring-ring aria-[current=page]:bg-card aria-[current=page]:text-sidebar-foreground aria-[current=page]:shadow-elev-1 aria-[current=page]:ring-1 aria-[current=page]:ring-sidebar-border before:absolute before:top-2 before:bottom-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-primary before:opacity-0 before:transition-opacity before:content-[''] aria-[current=page]:before:opacity-100 pointer-coarse:py-2.5"

/** A link of the sidebar: an icon and a label, drawn as selected (a raised row and a cobalt bar) on its own page. */
export function NavLink(props: {
  readonly to: LinkProps['to']
  readonly icon: LucideIcon
  readonly exact?: boolean
  readonly children: ReactNode
}) {
  const Icon = props.icon
  return (
    <Link to={props.to} activeOptions={{ exact: props.exact === true }} className={BASE}>
      <Icon
        aria-hidden='true'
        strokeWidth={1.85}
        className='size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-sidebar-foreground group-aria-[current=page]:text-primary'
      />
      <span>{props.children}</span>
    </Link>
  )
}

/** A link inside an open section of the sidebar: the label only, indented under its section. */
export function SubNavLink(props: {
  readonly to: LinkProps['to']
  readonly exact?: boolean
  readonly children: ReactNode
}) {
  return (
    <Link
      to={props.to}
      activeOptions={{ exact: props.exact === true }}
      className='block rounded-md py-1 pr-2.5 pl-3 text-[0.8125rem] text-sidebar-foreground/70 transition-colors duration-150 outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-[3px] focus-visible:ring-ring aria-[current=page]:font-semibold aria-[current=page]:text-primary pointer-coarse:py-2.5'
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
    <div role='group' aria-labelledby={labelId} className='flex flex-col gap-0.5'>
      <span
        id={labelId}
        className='px-2.5 pt-4 pb-1.5 text-[0.6875rem] font-semibold tracking-[0.02em] text-muted-foreground'
      >
        {props.label}
      </span>
      {props.children}
    </div>
  )
}
