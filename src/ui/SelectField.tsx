import { CircleAlert } from 'lucide-react'
import { type Ref, useId } from 'react'
import { Label } from '~/components/ui/label'
import { Select, type SelectOption } from '~/components/ui/select'
import { cn } from '~/lib/utils'

/** What `onChange` receives: the chosen value at `target.value`, as a native select would give. */
export type SelectChange = { readonly target: { readonly value: string } }

/**
 * A labelled select whose error is tied to it with `aria-describedby`. `inline` puts the label
 * beside a compact select, for a filter in a list's toolbar. The list is the paper-styled
 * `Select`, not the browser's own.
 */
export function SelectField(props: {
  readonly label: string
  readonly error?: string | undefined
  readonly options: readonly SelectOption[]
  readonly inline?: boolean
  readonly value: string
  readonly onChange: (event: SelectChange) => void
  readonly name?: string
  readonly disabled?: boolean
  readonly required?: boolean
  readonly className?: string
  readonly placeholder?: string
  readonly 'aria-describedby'?: string | undefined
  readonly triggerRef?: Ref<HTMLButtonElement>
}) {
  const { label, error, options, inline, onChange, className, triggerRef, ...select } = props
  const id = useId()
  const errorId = `${id}-error`
  const describedBy =
    [select['aria-describedby'], error ? errorId : null].filter(Boolean).join(' ') || undefined
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
      <Select
        id={id}
        options={options}
        value={select.value}
        onValueChange={(value) => onChange({ target: { value } })}
        controlSize={inline ? 'sm' : 'default'}
        {...(select.name === undefined ? {} : { name: select.name })}
        {...(select.disabled === undefined ? {} : { disabled: select.disabled })}
        {...(select.required === undefined ? {} : { required: select.required })}
        {...(select.placeholder === undefined ? {} : { placeholder: select.placeholder })}
        {...(className === undefined ? {} : { className })}
        {...(triggerRef === undefined ? {} : { triggerRef })}
        {...(error ? { 'aria-invalid': 'true' as const } : {})}
        {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })}
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
