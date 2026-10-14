import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '~/lib/utils'

/** The look of a button: one primary action per view, the rest quieter. */
export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-semibold whitespace-nowrap transition-[background-color,color,box-shadow,border-color,transform] duration-150 ease-snappy outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring active:translate-y-px aria-disabled:cursor-not-allowed aria-disabled:opacity-60 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-elev-1 inset-shadow-[0_1px_0_rgb(255_255_255/0.14)] hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground shadow-elev-1 hover:bg-destructive/90',
        outline:
          'border border-border-strong bg-card text-foreground shadow-elev-1 hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
        ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
        /** A quiet destructive action in a row (Remove, Delete): red text, a red tint on hover. */
        'ghost-destructive': 'text-destructive hover:bg-danger-soft',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2 pointer-coarse:h-11',
        sm: 'h-9 gap-1.5 px-3 pointer-coarse:h-11',
        lg: 'h-11 px-6',
        icon: 'size-10 pointer-coarse:size-11',
        'icon-sm': 'size-9 pointer-coarse:size-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

/** A button, or any element it wraps with `asChild`, in one of the variants. */
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      data-slot='button'
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}
