import { type FormEvent, useCallback, useRef, useState } from 'react'
import {
  type BookingType,
  type CreateBookingTypeRequest,
  createBookingTypeRequestSchema,
} from 'tula-closeline-contract'
import { presentBookingType } from '~/api/booking-messages'
import { fingerprint } from '~/api/idempotency'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { Section } from '~/components/app/section'
import { can } from '~/data/permissions'
import { refresh, useBookingTypes } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { Banner } from '~/ui/Banner'
import { Confirm } from '~/ui/Confirm'
import { Field } from '~/ui/Field'
import { Paged } from '~/ui/Paged'
import { plain } from '~/ui/plain'
import { SelectField } from '~/ui/SelectField'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useClearOnSuccess, useFeedback } from '~/ui/useFeedback'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'

/** Where the public booking page lives; the token in it always comes from core. */
const publicLink = (token: string) => `${window.location.origin}/book/${encodeURIComponent(token)}`

/** The Booking Types of the Organization; Owners and Admins define, change and retire them, and nobody else sees the page. */
export function BookingTypesScreen() {
  useDocumentTitle('Booking Types')
  const role = useRole()
  if (role === null) {
    return null
  }
  if (!can.manageBookingTypes(role)) {
    return (
      <>
        <PageHeader eyebrow='Sales' title='Booking Types' />
        <p role='status' className='notice'>
          Only an Owner or Admin can manage Booking Types. Ask one of them if you need one changed.
        </p>
      </>
    )
  }
  return <BookingTypesAdmin />
}

function BookingTypesAdmin() {
  const types = useBookingTypes(true)
  const feedback = useFeedback()
  return (
    <>
      <PageHeader
        eyebrow='Sales'
        title='Booking Types'
        description='The kinds of Booking a Prospect can make: how long, how much room around it, how soon, and by phone or video. Each has a public link you can send.'
      />
      <div className='grid items-start gap-12 lg:grid-cols-12'>
        <Section
          id='add-booking-type'
          title='Add a Booking Type'
          description='Core makes the public link when you save.'
          className='lg:sticky lg:top-8 lg:order-2 lg:col-span-4'
        >
          <CreateForm onDone={feedback.done} onFail={feedback.failed} />
        </Section>
        <div className='flex min-w-0 flex-col gap-4 lg:order-1 lg:col-span-8'>
          <p role='status' className='notice'>
            {feedback.notice}
          </p>
          <h2 className='m-0 border-t border-rule-strong pt-4'>All Booking Types</h2>
          <Paged
            noun='Booking Types'
            emptyText='There are no Booking Types yet.'
            emptyHint='Add the first one with the form on this page.'
            state={types.state}
            present={presentBookingType}
          >
            <ul
              className='m-0 list-none divide-y border-y p-0 motion-safe:animate-fade'
              aria-label='Booking Types'
            >
              {types.items.map((type) => (
                <TypeItem
                  key={type.id}
                  type={type}
                  onDone={feedback.done}
                  onFail={feedback.failed}
                  serial={feedback.serial}
                />
              ))}
            </ul>
          </Paged>
        </div>
      </div>
    </>
  )
}

type Draft = {
  readonly name: string
  readonly lengthMinutes: string
  readonly bufferBeforeMinutes: string
  readonly bufferAfterMinutes: string
  readonly minimumNoticeMinutes: string
  readonly mode: 'phone' | 'video'
}

const EMPTY: Draft = {
  name: '',
  lengthMinutes: '30',
  bufferBeforeMinutes: '0',
  bufferAfterMinutes: '0',
  minimumNoticeMinutes: '60',
  mode: 'video',
}

const draftOf = (type: BookingType): Draft => ({
  name: type.name,
  lengthMinutes: String(type.lengthMinutes),
  bufferBeforeMinutes: String(type.bufferBeforeMinutes),
  bufferAfterMinutes: String(type.bufferAfterMinutes),
  minimumNoticeMinutes: String(type.minimumNoticeMinutes),
  mode: type.mode,
})

const FIELD_WORDS: Record<keyof Draft, string> = {
  name: 'Enter a name, such as Discovery call.',
  lengthMinutes: 'Enter the length as a whole number of minutes, from 5 to 480.',
  bufferBeforeMinutes: 'Enter the buffer before as a whole number of minutes, from 0 to 120.',
  bufferAfterMinutes: 'Enter the buffer after as a whole number of minutes, from 0 to 120.',
  minimumNoticeMinutes: 'Enter the minimum notice as whole minutes, from 0 to 43200 (30 days).',
  mode: 'Choose phone or video.',
}

const MODE_OPTIONS = [
  { value: 'video', text: 'Video' },
  { value: 'phone', text: 'Phone' },
]

type DraftErrors = Partial<Record<keyof Draft, string>>

const toNumber = (text: string) => (/^\d{1,6}$/.test(text.trim()) ? Number(text) : Number.NaN)

/** Validates a draft with the contract's schema; the words for each field that fails, or the body. */
function check(draft: Draft): { body: CreateBookingTypeRequest } | { errors: DraftErrors } {
  const parsed = createBookingTypeRequestSchema.safeParse({
    name: draft.name,
    lengthMinutes: toNumber(draft.lengthMinutes),
    bufferBeforeMinutes: toNumber(draft.bufferBeforeMinutes),
    bufferAfterMinutes: toNumber(draft.bufferAfterMinutes),
    minimumNoticeMinutes: toNumber(draft.minimumNoticeMinutes),
    mode: draft.mode,
  })
  if (parsed.success) {
    return { body: parsed.data }
  }
  const errors: DraftErrors = {}
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0]) as keyof Draft
    if (field in FIELD_WORDS) {
      errors[field] = FIELD_WORDS[field]
    }
  }
  return { errors }
}

/** The six fields of a Booking Type, used to add one and to change one; it validates, then hands over the body. */
function TypeForm(props: {
  readonly idPrefix: string
  readonly id?: string
  readonly initial: Draft
  readonly submitLabel: string
  readonly pendingLabel: string
  readonly pending: boolean
  readonly formError: string | undefined
  readonly onValid: (body: CreateBookingTypeRequest) => void
  readonly onInvalid: () => void
  readonly onCancel?: () => void
  readonly ariaLabel: string
  readonly className?: string
}) {
  const [draft, setDraft] = useState(props.initial)
  const [errors, setErrors] = useState<DraftErrors>({})
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const set = (key: keyof Draft) => (event: { readonly target: { readonly value: string } }) =>
    setDraft((now) => ({ ...now, [key]: event.target.value }))
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (props.pending) {
      return
    }
    props.onInvalid()
    const result = check(draft)
    if ('errors' in result) {
      setErrors(result.errors)
      focusFirstError()
      return
    }
    setErrors({})
    props.onValid(result.body)
  }
  const minutes = (key: keyof Draft, label: string) => (
    <Field
      label={label}
      name={`${props.idPrefix}-${key}`}
      autoComplete='off'
      inputMode='numeric'
      value={draft[key]}
      error={errors[key]}
      onChange={set(key)}
    />
  )
  return (
    <form
      ref={formRef}
      id={props.id}
      onSubmit={onSubmit}
      noValidate
      aria-label={props.ariaLabel}
      className={props.className ?? 'gap-0'}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          props.onCancel?.()
        }
      }}
    >
      {props.formError ? (
        <Banner kind='error' innerRef={bannerRef}>
          {props.formError}
        </Banner>
      ) : null}
      <Field
        label='Name'
        name={`${props.idPrefix}-name`}
        autoComplete='off'
        value={draft.name}
        error={errors.name}
        onChange={set('name')}
      />
      <SelectField
        label='Mode'
        name={`${props.idPrefix}-mode`}
        value={draft.mode}
        options={MODE_OPTIONS}
        error={errors.mode}
        onChange={(event) =>
          setDraft((now) => ({ ...now, mode: event.target.value === 'phone' ? 'phone' : 'video' }))
        }
      />
      {minutes('lengthMinutes', 'Length (minutes)')}
      {minutes('bufferBeforeMinutes', 'Buffer before (minutes)')}
      {minutes('bufferAfterMinutes', 'Buffer after (minutes)')}
      {minutes('minimumNoticeMinutes', 'Minimum notice (minutes)')}
      <div className='row-actions'>
        <button type='submit' className='button' aria-disabled={props.pending}>
          {props.pending ? props.pendingLabel : props.submitLabel}
        </button>
        {props.onCancel ? (
          <button type='button' className='button button-quiet' onClick={props.onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  )
}

function CreateForm(props: {
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const app = useApp()
  const [error, setError] = useState<string | undefined>()
  // A new key gives the form its empty fields back after a save.
  const [round, setRound] = useState(0)
  const add = useSubmit<CreateBookingTypeRequest>(
    async (body) => {
      const attempt = app.keys.begin(fingerprint.bookingTypeCreate(JSON.stringify(body)))
      try {
        await app.bookingTypes.create(body, attempt.key)
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      setError(undefined)
      setRound((n) => n + 1)
      await refresh(app, 'bookingTypes')
      props.onDone('Booking Type added.')
    },
    {
      onError(failure) {
        props.onFail()
        setError(presentBookingType(failure).message)
      },
    }
  )
  return (
    <TypeForm
      key={round}
      idPrefix='add'
      ariaLabel='Add a Booking Type'
      initial={EMPTY}
      submitLabel='Add Booking Type'
      pendingLabel='Adding...'
      pending={add.pending}
      formError={error}
      onInvalid={() => {
        setError(undefined)
        props.onFail()
      }}
      onValid={add.submit}
    />
  )
}

const minutesWord = (n: number) => `${n} min`

function TypeItem(props: {
  readonly type: BookingType
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
  readonly serial: number
}) {
  const { type } = props
  const app = useApp()
  const label = plain(type.name, 'this Booking Type')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | undefined>()
  const [fallback, setFallback] = useState<string | null>(null)
  const editButton = useRef<HTMLButtonElement>(null)
  const errorId = `${type.id}-error`
  const clearError = useCallback(() => setError(null), [])
  useClearOnSuccess(props.serial, clearError)
  const retire = useSubmit<void>(
    async () => {
      setError(null)
      await app.bookingTypes.retire(type.id)
      await refresh(app, 'bookingTypes')
      props.onDone('Booking Type retired.')
    },
    {
      onError(failure) {
        props.onFail()
        setError(presentBookingType(failure).message)
      },
    }
  )
  const save = useSubmit<CreateBookingTypeRequest>(
    async (body) => {
      await app.bookingTypes.update(type.id, body)
      setEditError(undefined)
      await refresh(app, 'bookingTypes')
      props.onDone('Booking Type saved.')
      setEditing(false)
      setTimeout(() => editButton.current?.focus(), 0)
    },
    {
      onError(failure) {
        props.onFail()
        setEditError(presentBookingType(failure).message)
      },
    }
  )
  const copy = () => {
    if (type.publicToken === null) {
      return
    }
    const link = publicLink(type.publicToken)
    setFallback(null)
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
    const failed = () => {
      props.onFail()
      setFallback(link)
      setError('Could not copy the link. Select it below and copy it yourself.')
    }
    if (clipboard === undefined) {
      failed()
      return
    }
    clipboard.writeText(link).then(() => props.onDone('Link copied.'), failed)
  }
  const active = type.state === 'active'
  return (
    <li className='py-4'>
      <div className='list-item-head'>
        <div className='flex min-w-0 flex-col'>
          <h3 className='item-title m-0 font-serif text-xl font-normal tracking-[-0.01em]'>
            <Untrusted value={type.name} />
          </h3>
          <span className='label-mono mt-1 block'>
            {active ? 'Active' : 'Retired'} · {type.mode === 'video' ? 'Video' : 'Phone'}
          </span>
          <span className='hint'>
            {minutesWord(type.lengthMinutes)} long, {minutesWord(type.bufferBeforeMinutes)} before,{' '}
            {minutesWord(type.bufferAfterMinutes)} after, {minutesWord(type.minimumNoticeMinutes)}{' '}
            notice
          </span>
        </div>
        {active ? (
          <div className='row-actions'>
            {type.publicToken === null ? null : (
              <button
                type='button'
                className='button button-quiet'
                aria-label={`Copy link for ${label}`}
                onClick={copy}
              >
                Copy link
              </button>
            )}
            <button
              type='button'
              ref={editButton}
              className='button button-quiet'
              aria-label={`Edit ${label}`}
              aria-expanded={editing}
              aria-controls={editing ? `${type.id}-edit` : undefined}
              onClick={() => setEditing((open) => !open)}
            >
              Edit
            </button>
            <Confirm
              label='Retire'
              accessibleName={`Retire ${label}`}
              pendingAccessibleName={`Retiring ${label}`}
              pendingLabel='Retiring...'
              question={
                <>
                  Retire <Untrusted value={type.name} />? It can no longer be booked and its public
                  link stops working. Its Bookings stay.
                </>
              }
              tone='quiet-destructive'
              confirmLabel='Retire Booking Type'
              pending={retire.pending}
              describedBy={error ? errorId : undefined}
              onConfirm={() => retire.submit()}
            />
          </div>
        ) : null}
      </div>
      {error ? (
        <p className='field-error' id={errorId} role='alert'>
          <strong>Error:</strong> {error}
        </p>
      ) : null}
      {fallback ? (
        <Field label='Public link' name={`${type.id}-link`} readOnly value={fallback} />
      ) : null}
      {active && editing ? (
        <TypeForm
          idPrefix={type.id}
          id={`${type.id}-edit`}
          ariaLabel={`Edit ${label}`}
          initial={draftOf(type)}
          submitLabel='Save changes'
          pendingLabel='Saving...'
          pending={save.pending}
          formError={editError}
          className='mt-3 max-w-none gap-0 border-l-2 border-rule-strong pl-4 motion-safe:animate-rise'
          onInvalid={() => {
            setEditError(undefined)
            props.onFail()
          }}
          onValid={save.submit}
          onCancel={() => {
            setEditing(false)
            setEditError(undefined)
            setTimeout(() => editButton.current?.focus(), 0)
          }}
        />
      ) : null}
    </li>
  )
}
