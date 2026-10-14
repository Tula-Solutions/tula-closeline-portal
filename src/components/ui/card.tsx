import type { ComponentProps } from 'react'
import { cn } from '~/lib/utils'

/** A raised surface that groups one thing. */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot='card'
      className={cn(
        'flex flex-col gap-4 rounded-xl border bg-card py-5 text-card-foreground shadow-xs',
        className
      )}
      {...props}
    />
  )
}

/** The top of a card: title, description and an optional action. */
export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot='card-header' className={cn('flex flex-col gap-1 px-5', className)} {...props} />
}

/** A card's title. */
export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return (
    <h2
      data-slot='card-title'
      className={cn('text-base leading-tight font-semibold tracking-tight', className)}
      {...props}
    />
  )
}

/** A card's one-line description. */
export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p data-slot='card-description' className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
}

/** A card's body. */
export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot='card-content' className={cn('px-5', className)} {...props} />
}

/** A card's footer, for actions. */
export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div data-slot='card-footer' className={cn('flex items-center gap-2 px-5', className)} {...props} />
  )
}
