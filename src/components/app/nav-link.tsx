import { Link, type LinkProps } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

const BASE =
  'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-[3px] focus-visible:ring-ring aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-foreground pointer-coarse:py-3'

/** A link of the sidebar: an icon and a label, drawn as selected on its own page. */
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
        className={cn(
          'size-[18px] shrink-0 text-muted-foreground group-aria-[current=page]:text-primary'
        )}
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
      className='block rounded-md py-1.5 pr-3 pl-3 text-sm text-sidebar-foreground/75 transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-[3px] focus-visible:ring-ring aria-[current=page]:font-semibold aria-[current=page]:text-primary pointer-coarse:py-2.5'
    >
      {props.children}
    </Link>
  )
}
