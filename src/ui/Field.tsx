import { CircleAlert } from 'lucide-react'
import { type InputHTMLAttributes, useId } from 'react'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'

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
    <div className='field mb-4 flex flex-col gap-2'>
      <Label htmlFor={id}>{label}</Label>
      {hint ? (
        <p className='text-sm text-muted-foreground' id={hintId}>
          {hint}
        </p>
      ) : null}
      <Input
        {...input}
        id={id}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy || undefined}
      />
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
