import { type InputHTMLAttributes, useId } from 'react'

/** A labelled input whose hint and error are tied to it with `aria-describedby`. */
export function Field(
  props: {
    readonly label: string
    readonly error?: string | undefined
    readonly hint?: string | undefined
  } & Omit<InputHTMLAttributes<HTMLInputElement>, 'aria-describedby' | 'aria-invalid' | 'id'>
) {
  const { label, error, hint, ...input } = props
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')
  return (
    <div className='field'>
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p className='hint' id={hintId}>
          {hint}
        </p>
      ) : null}
      <input
        {...input}
        id={id}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy || undefined}
      />
      {error ? (
        <p className='field-error' id={errorId}>
          <strong>Error:</strong> {error}
        </p>
      ) : null}
    </div>
  )
}
