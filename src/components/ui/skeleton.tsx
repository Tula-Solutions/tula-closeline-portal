import type { ComponentProps } from 'react'
import { cn } from '~/lib/utils'

/** A placeholder with the shape of what is loading. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot='skeleton'
      aria-hidden='true'
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  )
}
