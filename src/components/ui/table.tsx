import type { ComponentProps } from 'react'
import { cn } from '~/lib/utils'

/** A data table inside its own scrolling frame. */
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <table
      data-slot='table'
      className={cn('w-full caption-bottom border-collapse text-sm', className)}
      {...props}
    />
  )
}

/** The header rows of a table. */
export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead data-slot='table-header' className={cn('[&_tr]:border-b', className)} {...props} />
}

/** The body rows of a table. */
export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody data-slot='table-body' className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

/** A table row. */
export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      data-slot='table-row'
      className={cn('border-b transition-colors hover:bg-muted/50', className)}
      {...props}
    />
  )
}

/** A column heading. */
export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      data-slot='table-head'
      className={cn(
        'h-10 px-3 text-left align-middle text-xs font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase',
        className
      )}
      {...props}
    />
  )
}

/** A cell. */
export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td data-slot='table-cell' className={cn('px-3 py-3 align-middle', className)} {...props} />
}
