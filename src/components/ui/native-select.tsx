import { ChevronDown } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '~/lib/utils'

/**
 * A select that is the browser's own (so it works with every keyboard, screen reader and phone
 * picker) drawn in the library's style, with a chevron.
 */
export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className='relative w-full' data-slot='native-select-wrapper'>
      <select
        data-slot='native-select'
        className={cn(
          'h-10 w-full min-w-0 appearance-none rounded-md border border-input bg-card py-2 pr-9 pl-3 text-base shadow-xs transition-[border-color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm pointer-coarse:h-11',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40',
          'aria-invalid:border-destructive aria-invalid:border-dashed aria-invalid:ring-destructive/25',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden='true'
        className='pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground'
      />
    </div>
  )
}
