import { CircleAlert } from 'lucide-react'
import { type SelectHTMLAttributes, useId } from 'react'
import { Label } from '~/components/ui/label'
import { NativeSelect } from '~/components/ui/native-select'
import { cn } from '~/lib/utils'

/**
 * A labelled select whose error is tied to it with `aria-describedby`. `inline` puts the label
 * beside a compact select, for a filter in a list's toolbar.
 */
export function SelectField(
  props: {
    readonly label: string
    readonly error?: string | undefined
    readonly options: readonly { readonly value: string; readonly text: string }[]
    readonly inline?: boolean
  } & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'aria-invalid' | 'id' | 'children'>
) {
  const { label, error, options, inline, ...select } = props
  const id = useId()
  const errorId = `${id}-error`
  return (
    <div
      className={cn(
        'field',
        inline ? 'flex flex-row items-center gap-2' : 'mb-4 flex flex-col gap-2'
      )}
    >
      <Label
        htmlFor={id}
        className={inline ? 'text-[0.8125rem] font-medium text-muted-foreground' : undefined}
      >
        {label}
      </Label>
      <NativeSelect
        {...select}
        id={id}
        controlSize={inline ? 'sm' : 'default'}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={
          [select['aria-describedby'], error ? errorId : null].filter(Boolean).join(' ') ||
          undefined
        }
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.text}
          </option>
        ))}
      </NativeSelect>
      {error ? (
        <p className='flex items-start gap-1.5 text-sm text-danger' id={errorId}>
          <CircleAlert aria-hidden='true' className='mt-0.5 size-4 shrink-0' />
          <span>
            <strong>Error:</strong> {error}
          </span>
        </p>
      ) : null}
    </div>
  )
}
