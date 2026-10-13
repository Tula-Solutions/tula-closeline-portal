import { type SelectHTMLAttributes, useId } from 'react'

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
    <div className='field'>
      <label htmlFor={id}>{label}</label>
      <select
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
      </select>
      {error ? (
        <p className='field-error' id={errorId}>
          <strong>Error:</strong> {error}
        </p>
      ) : null}
    </div>
  )
}
