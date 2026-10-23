import { CircleAlert } from 'lucide-react'
import { type TextareaHTMLAttributes, useId } from 'react'
import { Label } from '~/components/ui/label'

/** A labelled multi-line field whose hint and error are tied to it with `aria-describedby`. */
export function TextAreaField(
  props: {
    readonly label: string
    readonly error?: string | undefined
    readonly hint?: string | undefined
  } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'aria-describedby' | 'aria-invalid' | 'id'>
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
      <textarea
        {...input}
        id={id}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy || undefined}
        className='flex min-h-32 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-base shadow-xs transition-[border-color,box-shadow] outline-hidden placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:border-dashed aria-invalid:ring-destructive/25 md:text-sm'
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
