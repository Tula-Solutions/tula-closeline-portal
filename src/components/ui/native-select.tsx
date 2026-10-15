import { cva, type VariantProps } from 'class-variance-authority'
import { ChevronDown } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '~/lib/utils'

const selectVariants = cva(
  'w-full min-w-0 cursor-pointer appearance-none text-foreground transition-[border-color,background-color] duration-150 ease-snappy outline-hidden disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      size: {
        default:
          'h-10 rounded-[4px] border border-input bg-popover py-2 pr-9 pl-3 text-base hover:border-foreground md:text-sm pointer-coarse:h-11',
        /** The height of a small button, for a select that sits in a row of them (a toolbar). */
        sm: 'h-9 rounded-[4px] border border-input bg-popover py-1.5 pr-8 pl-2.5 text-sm hover:border-foreground pointer-coarse:h-11',
        /** Set into a line of text, as in a ledger row: no box, an underline that darkens on hover. */
        inline:
          'h-8 rounded-none border-0 border-b border-input bg-transparent py-1 pr-6 pl-0 text-sm hover:border-foreground pointer-coarse:h-11',
      },
    },
    defaultVariants: { size: 'default' },
  }
)

/**
 * A select that is the browser's own (so it works with every keyboard, screen reader and phone
 * picker) drawn in the library's style, with a chevron. `controlSize="sm"` matches a small button;
 * `"inline"` sets it as an underlined word in a row.
 */
export function NativeSelect({
  className,
  children,
  controlSize,
  ...props
}: Omit<ComponentProps<'select'>, 'size'> & {
  readonly controlSize?: VariantProps<typeof selectVariants>['size']
}) {
  const compact = controlSize === 'sm' || controlSize === 'inline'
  return (
    <div className={cn('relative', compact ? 'w-auto' : 'w-full')} data-slot='native-select-wrapper'>
      <select
        data-slot='native-select'
        className={cn(
          selectVariants({ size: controlSize }),
          'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'aria-invalid:border-destructive aria-invalid:border-dashed',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden='true'
        data-slot='native-select-icon'
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground',
          controlSize === 'inline'
            ? 'right-0 size-3.5'
            : controlSize === 'sm'
              ? 'right-2.5 size-3.5'
              : 'right-3 size-4'
        )}
      />
    </div>
  )
}
