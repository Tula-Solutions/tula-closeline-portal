import { cva, type VariantProps } from 'class-variance-authority'
import { ChevronsUpDown } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '~/lib/utils'

const selectVariants = cva(
  'w-full min-w-0 cursor-pointer appearance-none rounded-md border border-input bg-card text-foreground shadow-elev-1 transition-[border-color,box-shadow,background-color] duration-150 ease-snappy outline-none hover:border-foreground/45 hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      size: {
        default: 'h-10 py-2 pr-9 pl-3 text-base md:text-sm pointer-coarse:h-11',
        /** The height of a small button, for a select that sits in a row of them (a table's actions). */
        sm: 'h-9 py-1.5 pr-8 pl-2.5 text-sm font-medium pointer-coarse:h-11',
      },
    },
    defaultVariants: { size: 'default' },
  }
)

/**
 * A select that is the browser's own (so it works with every keyboard, screen reader and phone
 * picker) drawn in the library's style, with a chevron. `controlSize="sm"` matches a small button.
 */
export function NativeSelect({
  className,
  children,
  controlSize,
  ...props
}: Omit<ComponentProps<'select'>, 'size'> & {
  readonly controlSize?: VariantProps<typeof selectVariants>['size']
}) {
  return (
    <div
      className={cn('relative', controlSize === 'sm' ? 'w-auto' : 'w-full')}
      data-slot='native-select-wrapper'
    >
      <select
        data-slot='native-select'
        className={cn(
          selectVariants({ size: controlSize }),
          'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          'aria-invalid:border-destructive aria-invalid:border-dashed aria-invalid:ring-destructive/25',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronsUpDown
        aria-hidden='true'
        data-slot='native-select-icon'
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground',
          controlSize === 'sm' ? 'right-2.5 size-3.5' : 'right-3 size-4'
        )}
      />
    </div>
  )
}
