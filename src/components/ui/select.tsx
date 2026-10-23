import * as SelectPrimitive from '@radix-ui/react-select'
import { cva, type VariantProps } from 'class-variance-authority'
import { Check, ChevronDown } from 'lucide-react'
import type { ComponentProps, Ref } from 'react'
import { cn } from '~/lib/utils'

/** Radix refuses an item whose value is the empty string, so an empty option is held under this. */
const EMPTY = '__empty__'

const triggerVariants = cva(
  'flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 text-left text-foreground transition-[border-color,background-color] duration-150 ease-snappy outline-hidden disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground',
  {
    variants: {
      size: {
        default:
          'h-10 rounded-[4px] border border-input bg-popover py-2 pr-3 pl-3 text-base hover:border-foreground md:text-sm pointer-coarse:h-11',
        /** The height of a small button, for a select that sits in a row of them (a toolbar). */
        sm: 'h-9 rounded-[4px] border border-input bg-popover py-1.5 pr-2.5 pl-2.5 text-sm hover:border-foreground pointer-coarse:h-11',
        /** Set into a line of text, as in a ledger row: no box, an underline that darkens on hover. */
        inline:
          'h-8 rounded-none border-0 border-b border-input bg-transparent py-1 pr-0 pl-0 text-sm hover:border-foreground pointer-coarse:h-11',
      },
    },
    defaultVariants: { size: 'default' },
  }
)

/** One choice of a select: the value it holds and the words it shows. */
export type SelectOption = { readonly value: string; readonly text: string }

/**
 * A select drawn in the library's paper style: a trigger that looks like a field, and a list on
 * the popover surface with a hairline border, a check on the chosen item and 44px rows on touch.
 * It keeps the keyboard of a native select (arrows, Home, End, type-ahead, Esc). An option may hold
 * the empty string, as in "All states".
 */
export function Select({
  options,
  value,
  onValueChange,
  controlSize,
  className,
  placeholder,
  triggerRef,
  id,
  name,
  disabled,
  required,
  ...aria
}: {
  readonly options: readonly SelectOption[]
  readonly value: string
  readonly onValueChange: (value: string) => void
  readonly controlSize?: VariantProps<typeof triggerVariants>['size']
  readonly placeholder?: string
  readonly triggerRef?: Ref<HTMLButtonElement>
  readonly id?: string
  readonly name?: string
  readonly disabled?: boolean
  readonly required?: boolean
  readonly className?: string
  readonly 'aria-invalid'?: 'true'
  readonly 'aria-describedby'?: string
  readonly 'aria-label'?: string
}) {
  const compact = controlSize === 'sm' || controlSize === 'inline'
  const hasValue = options.some((option) => option.value === value)
  return (
    <SelectPrimitive.Root
      value={hasValue ? (value === '' ? EMPTY : value) : ''}
      onValueChange={(next) => onValueChange(next === EMPTY ? '' : next)}
      {...(name === undefined ? {} : { name })}
      {...(disabled === undefined ? {} : { disabled })}
      {...(required === undefined ? {} : { required })}
    >
      <SelectPrimitive.Trigger
        ref={triggerRef}
        id={id}
        data-slot='select-trigger'
        data-value={hasValue ? value : undefined}
        className={cn(
          triggerVariants({ size: controlSize }),
          compact ? 'w-auto' : 'w-full',
          'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'aria-invalid:border-destructive aria-invalid:border-dashed',
          className
        )}
        {...aria}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown
            aria-hidden='true'
            className={cn('shrink-0 text-muted-foreground', compact ? 'size-3.5' : 'size-4')}
          />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          data-slot='select-content'
          position='popper'
          sideOffset={4}
          collisionPadding={8}
          className='z-50 max-h-[min(20rem,var(--radix-select-content-available-height))] min-w-[max(8rem,var(--radix-select-trigger-width))] overflow-hidden rounded-[4px] border border-border-strong bg-popover text-popover-foreground shadow-elev-2 motion-safe:data-[state=open]:animate-fade'
        >
          <SelectPrimitive.Viewport className='p-1'>
            {options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value === '' ? EMPTY : option.value}
                data-value={option.value}
              >
                {option.text}
              </SelectItem>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

/** One row of the list: the words, and a check when it is the chosen one. */
function SelectItem({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot='select-item'
      className={cn(
        'relative flex min-h-9 cursor-pointer items-center rounded-[3px] py-1.5 pr-3 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[highlighted]:ring-2 data-[highlighted]:ring-ring data-[highlighted]:ring-inset pointer-coarse:min-h-11',
        className
      )}
      {...props}
    >
      <span className='absolute left-2.5 flex size-4 items-center justify-center'>
        <SelectPrimitive.ItemIndicator>
          <Check aria-hidden='true' className='size-4' />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}
