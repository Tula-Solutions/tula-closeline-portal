import type { ComponentProps } from 'react'
import { cn } from '~/lib/utils'

/** A text field. Its border meets 3:1 against the surface; an invalid one is red, thick and dashed. */
export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot='input'
      className={cn(
        'flex h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-base shadow-xs transition-[border-color,box-shadow] outline-hidden placeholder:text-muted-foreground file:text-sm disabled:cursor-not-allowed disabled:opacity-50 md:text-sm pointer-coarse:h-11',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40',
        'aria-invalid:border-destructive aria-invalid:border-dashed aria-invalid:ring-destructive/25',
        type === 'file' && 'h-auto py-1.5 pointer-coarse:h-auto',
        className
      )}
      {...props}
    />
  )
}
