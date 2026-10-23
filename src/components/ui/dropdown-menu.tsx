import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '~/lib/utils'

/**
 * A menu of actions. It is never modal: a modal menu injects a <style> element to lock scrolling,
 * which the Content-Security-Policy forbids.
 */
export function DropdownMenu(props: ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root modal={false} {...props} />
}

/** What opens the menu. */
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

/** The menu panel. */
export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot='dropdown-menu-content'
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-56 origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-[4px] border border-border bg-popover p-1.5 text-popover-foreground shadow-elev-2 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-98 data-[state=open]:duration-160 data-[state=open]:ease-(--ease-out) data-[side=bottom]:data-[state=open]:slide-in-from-top-1 data-[side=top]:data-[state=open]:slide-in-from-bottom-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-98 data-[state=closed]:duration-110 data-[state=closed]:ease-(--ease-in)',
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

/** One action in a menu. */
export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot='dropdown-menu-item'
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        className
      )}
      {...props}
    />
  )
}

/** A choice in a group where one is on. */
export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot='dropdown-menu-radio-item'
      className={cn(
        'relative flex cursor-pointer items-center gap-2 rounded-md py-2 pr-2.5 pl-8 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&_svg]:size-4',
        className
      )}
      {...props}
    >
      <span className='absolute left-2.5 flex size-4 items-center justify-center'>
        <DropdownMenuPrimitive.ItemIndicator>
          <Check aria-hidden='true' />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
}

/** The group the radio items belong to. */
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

/** A small heading inside a menu. */
export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot='dropdown-menu-label'
      className={cn('px-2.5 py-1.5 text-xs font-semibold text-muted-foreground', className)}
      {...props}
    />
  )
}

/** A line between groups of items. */
export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot='dropdown-menu-separator'
      className={cn('-mx-1.5 my-1.5 h-px bg-border', className)}
      {...props}
    />
  )
}
