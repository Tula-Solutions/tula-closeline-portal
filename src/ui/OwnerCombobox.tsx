import { Check, ChevronDown, CircleAlert } from 'lucide-react'
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react'
import { MAX_MEMBER_QUERY_LENGTH, type Role } from 'tula-closeline-contract'
import { Label } from '~/components/ui/label'
import { ROLE_LABEL } from '~/data/permissions'
import { useMemberSearch, useMembersByIds } from '~/data/queries'
import { cn } from '~/lib/utils'
import { plain } from '~/ui/plain'
import { useSettled } from '~/ui/useSettled'

type Choice = { readonly id: string; readonly text: string }

/**
 * One searchable owner choice: a field you type a name into, with the matching members listed
 * under it, in place of a separate search box and a list. The server does the search (the first
 * page only, after a pause), so a large Organization is never listed whole. The chosen member keeps
 * its name when a later search does not list it. `anyText` is the empty choice ("Any owner",
 * "Me"). Arrows move, Enter chooses, Esc closes; it follows the ARIA combobox pattern.
 */
export function OwnerCombobox(props: {
  readonly label: string
  readonly anyText: string
  readonly value: string
  readonly valueName: string
  readonly onChange: (id: string, name: string) => void
  readonly enabled: boolean
  readonly inline?: boolean
  readonly error?: string | undefined
  readonly hint?: (hasMore: boolean) => string
  /** Lists only members holding this role; the server does the filtering. */
  readonly memberRole?: Role
  /** A further client-side filter for choices no single role covers (several roles). */
  readonly accept?: (member: { readonly role: string }) => boolean
  /** Adds each member's role to the name ("Maya Chen (Admin)"), for a pick across all roles. */
  readonly showRole?: boolean
}) {
  const {
    label,
    anyText,
    value,
    valueName,
    onChange,
    enabled,
    inline,
    error,
    hint,
    memberRole,
    accept,
    showRole,
  } = props
  const id = useId()
  const listId = `${id}-list`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const [typing, setTyping] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const members = useMemberSearch(useSettled(typing ?? ''), enabled, memberRole)
  // A chosen member whose name the caller does not have (from the address, or a stored assignment).
  const resolved = useMembersByIds([value], enabled && value !== '' && valueName === '')
  const root = useRef<HTMLDivElement>(null)

  const choices = useMemo<readonly Choice[]>(() => {
    const withRole = (member: { name: string | null; email: string; role: Role }) => {
      const name = plain(member.name ?? member.email, 'Unnamed member')
      return showRole ? `${name} (${ROLE_LABEL[member.role]})` : name
    }
    const listed = members.items
      .filter((member) => accept === undefined || accept(member))
      .map((member) => ({
        id: member.id,
        text: withRole(member),
      }))
    const found = resolved.get(value)
    const keptText = valueName || (found === undefined ? '' : withRole(found)) || 'Selected owner'
    const kept =
      value !== '' && !listed.some((choice) => choice.id === value)
        ? [{ id: value, text: keptText }]
        : []
    return [{ id: '', text: anyText }, ...kept, ...listed]
  }, [members.items, accept, resolved, value, valueName, anyText, showRole])

  const chosenText = choices.find((choice) => choice.id === value)?.text ?? anyText

  useEffect(() => {
    if (!open) {
      return
    }
    const close = (event: PointerEvent) => {
      if (root.current !== null && !root.current.contains(event.target as Node)) {
        setOpen(false)
        setTyping(null)
      }
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const choose = (choice: Choice) => {
    onChange(choice.id, choice.id === '' ? '' : choice.text)
    setTyping(null)
    setOpen(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((now) => (now + step + choices.length) % choices.length)
    } else if (event.key === 'Enter') {
      // Enter must never submit the form behind the field.
      event.preventDefault()
      const choice = choices[Math.min(active, choices.length - 1)]
      if (open && choice !== undefined) {
        choose(choice)
      }
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      setTyping(null)
    } else if (event.key === 'Tab') {
      setOpen(false)
      setTyping(null)
    }
  }

  const described = [hint === undefined ? null : hintId, error ? errorId : null]
    .filter(Boolean)
    .join(' ')
  return (
    <div
      ref={root}
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
      <div className={cn('relative', inline ? 'w-56' : 'w-full')}>
        <input
          id={id}
          type='text'
          role='combobox'
          autoComplete='off'
          aria-autocomplete='list'
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? `${id}-option-${active}` : undefined}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={described || undefined}
          maxLength={MAX_MEMBER_QUERY_LENGTH}
          data-slot='combobox-input'
          className='h-10 w-full min-w-0 rounded-[4px] border border-input bg-popover py-2 pr-9 pl-3 text-base text-foreground transition-[border-color] duration-150 ease-snappy outline-hidden hover:border-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-destructive aria-invalid:border-dashed md:text-sm pointer-coarse:h-11 max-md:h-11'
          value={typing ?? chosenText}
          onFocus={(event) => event.currentTarget.select()}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setTyping(event.target.value)
            setActive(0)
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type='button'
          tabIndex={-1}
          aria-hidden='true'
          className='absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground pointer-coarse:w-11'
          onClick={() => {
            setOpen((now) => !now)
            document.getElementById(id)?.focus()
          }}
        >
          <ChevronDown aria-hidden='true' className='size-4' />
        </button>
        {open ? (
          <div
            id={listId}
            role='listbox'
            aria-label={label}
            data-slot='combobox-list'
            className='absolute top-full right-0 left-0 z-50 mt-1 max-h-72 min-w-[12rem] overflow-y-auto rounded-[4px] border border-border-strong bg-popover p-1 text-popover-foreground shadow-elev-2 motion-safe:animate-fade'
          >
            {choices.map((choice, index) => (
              // biome-ignore lint/a11y/useFocusableInteractive: focus stays in the input; the option is reached by aria-activedescendant
              // biome-ignore lint/a11y/useKeyWithClickEvents: the input handles the keys (arrows, Enter); a click is the pointer path
              <div
                key={choice.id}
                id={`${id}-option-${index}`}
                role='option'
                aria-selected={choice.id === value}
                data-highlighted={index === active ? '' : undefined}
                className='relative flex min-h-9 cursor-pointer items-center rounded-[3px] py-1.5 pr-3 pl-8 text-sm select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[highlighted]:ring-2 data-[highlighted]:ring-ring data-[highlighted]:ring-inset pointer-coarse:min-h-11 max-md:min-h-11'
                // Keep the focus in the field while the pointer chooses.
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(index)}
                onClick={() => choose(choice)}
              >
                {choice.id === value ? (
                  <Check aria-hidden='true' className='absolute left-2.5 size-4' />
                ) : null}
                {choice.text}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {hint === undefined ? null : (
        <p id={hintId} className='m-0 text-sm text-muted-foreground'>
          {hint(members.hasMore)}
        </p>
      )}
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
