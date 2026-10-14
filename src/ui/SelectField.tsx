import { CircleAlert } from 'lucide-react'
import { type SelectHTMLAttributes, useId } from 'react'
import { Label } from '~/components/ui/label'
import { NativeSelect } from '~/components/ui/native-select'

/** A labelled select whose error is tied to it with `aria-describedby`. */
export function SelectField(
  props: {
    readonly label: string
    readonly error?: string | undefined
    readonly options: readonly { readonly value: string; readonly text: string }[]
  } & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'aria-invalid' | 'id' | 'children'>
) {
  const { label, error, options, ...select } = props
  const id = useId()
  const errorId = `${id}-error`
  return (
    <div className='field mb-4 flex flex-col gap-2'>
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect
        {...select}
        id={id}
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
