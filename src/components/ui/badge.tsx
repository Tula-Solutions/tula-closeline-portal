import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '~/lib/utils'

/** The look of a badge: neutral, or one of the four meanings (each pairs colour with a word at the call site). */
export const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1.5 rounded-full border px-2 py-0.5 text-xs leading-4 font-semibold whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3.5',
  {
    variants: {
      variant: {
        neutral: 'border-transparent bg-muted text-muted-foreground',
        outline: 'border-border-strong bg-transparent text-foreground',
        success: 'border-success/25 bg-success-soft text-success',
        warning: 'border-warning/25 bg-warning-soft text-warning',
        danger: 'border-danger/25 bg-danger-soft text-danger',
        info: 'border-info/25 bg-info-soft text-info',
        primary: 'border-primary/25 bg-primary/10 text-primary',
      },
    },
    defaultVariants: { variant: 'neutral' },
  }
)

/** A small label for a state or a count. */
export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot='badge' className={cn(badgeVariants({ variant }), className)} {...props} />
}

/**
 * The dot at the start of a status badge, in the badge's colour. `live` adds a soft pulse for a state
 * that is still moving (processing); the pulse is off when motion is reduced.
 */
export function BadgeDot(props: { readonly live?: boolean }) {
  return (
    <span aria-hidden='true' data-slot='badge-dot' className='relative inline-flex size-1.5 shrink-0'>
      {props.live ? (
        <span className='absolute inset-0 rounded-full bg-current motion-safe:animate-ping-soft' />
      ) : null}
      <span className='relative inline-flex size-1.5 rounded-full bg-current' />
    </span>
  )
}
