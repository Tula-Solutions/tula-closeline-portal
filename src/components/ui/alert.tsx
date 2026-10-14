import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '~/lib/utils'

const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[1.25rem_1fr] has-[>svg]:gap-x-3 [&>svg]:size-5 [&>svg]:translate-y-0.5',
  {
    variants: {
      variant: {
        info: 'border-info/30 bg-info-soft text-info',
        success: 'border-success/30 bg-success-soft text-success',
        warning: 'border-warning/30 bg-warning-soft text-warning',
        danger: 'border-danger/30 bg-danger-soft text-danger',
      },
    },
    defaultVariants: { variant: 'info' },
  }
)

/** A message about the page or a form, in one of the four meanings. The caller sets the live-region role. */
export function Alert({
  className,
  variant,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div data-slot='alert' className={cn(alertVariants({ variant }), className)} {...props} />
}

/** The body of an alert. */
export function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot='alert-description'
      className={cn('col-start-2 text-sm [&_p]:leading-relaxed', className)}
      {...props}
    />
  )
}
