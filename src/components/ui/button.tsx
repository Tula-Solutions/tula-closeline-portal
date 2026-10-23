import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '~/lib/utils'

/** The look of a button: one primary action per view, the rest quieter. */
export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[4px] text-sm font-semibold whitespace-nowrap transition-[background-color,color,border-color,transform,text-decoration-color] duration-150 ease-snappy outline-hidden select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px aria-disabled:cursor-not-allowed aria-disabled:opacity-60 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-rule-strong bg-transparent text-foreground hover:bg-accent',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
        ghost: 'text-foreground hover:bg-accent',
        /** A quiet destructive action in a row (Remove, Delete): red text, underlined on hover. */
        'ghost-destructive':
          'px-0 font-medium text-destructive underline decoration-destructive/70 underline-offset-4 hover:decoration-current',
        /** A text action: ink, a hairline underline that darkens on hover. */
        link: 'px-0 font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-current',
      },
      size: {
        default: 'h-10 px-4 py-2 pointer-coarse:h-11 max-md:h-11',
        sm: 'h-9 gap-1.5 px-3 pointer-coarse:h-11 max-md:h-11',
        lg: 'h-11 px-6',
        icon: 'size-10 pointer-coarse:size-11 max-md:size-11',
        'icon-sm': 'size-9 pointer-coarse:size-11 max-md:size-11',
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
