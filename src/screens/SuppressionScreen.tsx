import { type FormEvent, useEffect, useState } from 'react'
import {
  type AddSuppressionRequest,
  addSuppressionRequestSchema,
  lookupSuppressionRequestSchema,
  MAX_SUPPRESSION_NOTE_LENGTH,
  removeSuppressionRequestSchema,
  SUPPRESSION_ADDRESS_KINDS,
  SUPPRESSION_REASONS,
  type SuppressionAddressKind,
  type SuppressionEntry,
  type SuppressionReason,
} from 'tula-closeline-contract'
import type { LookupSuppressionRequest, SuppressionFilter } from '~/api/consent'
import { presentConsent } from '~/api/consent-messages'
import { fingerprint } from '~/api/idempotency'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { Section } from '~/components/app/section'
import { ADDRESS_KIND_WORD, REASON_WORD } from '~/data/consent'
import { can } from '~/data/permissions'
import { refresh, useSuppressionEntries } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
import { Paged } from '~/ui/Paged'
import { plain } from '~/ui/plain'
import { SelectField } from '~/ui/SelectField'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useFeedback } from '~/ui/useFeedback'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'
import { When } from '~/ui/When'

/** The Suppression list of the Organization; Owners and Admins search, add and remove, nobody else sees it. */
export function SuppressionScreen() {
  useDocumentTitle('Suppression')
  const role = useRole()
  if (role === null) {
    return null
  }
  if (!can.manageSuppression(role)) {
    return (
      <>
        <PageHeader eyebrow='Organization' title='Suppression' />
        <p role='status' className='notice'>
          Only an Owner or Admin can manage Suppression. Ask one of them if an address needs to be
          added or taken off.
        </p>
      </>
    )
  }
  return <SuppressionAdmin />
}

function pick<T extends string>(values: readonly T[], value: string): T | undefined {
  return values.find((candidate) => candidate === value)
}

function SuppressionAdmin() {
  const feedback = useFeedback()
  const [reason, setReason] = useState<SuppressionReason | undefined>()
  const [addressKind, setAddressKind] = useState<SuppressionAddressKind | undefined>()
  const [state, setState] = useState<'active' | 'removed'>('active')
  const filter: SuppressionFilter = { reason, addressKind, state }
  const entries = useSuppressionEntries(filter, true)
  return (
    <>
      <PageHeader
        eyebrow='Organization'
        title='Suppression'
        description='Addresses no Agent may contact, whether the Prospect asked, the address bounced or someone on your team added it.'
      />
      <div className='grid items-start gap-12 lg:grid-cols-12'>
        <div className='flex flex-col gap-12 lg:sticky lg:top-8 lg:order-2 lg:col-span-4'>
          <Section
            id='add-suppression'
            title='Add an address'
            description='Add an address by hand. Only an entry added this way can be taken off later.'
          >
            <AddForm onDone={feedback.done} onFail={feedback.failed} />
          </Section>
          <Section
            id='check-suppression'
            title='Check an address'
            description='Find out whether one exact address is on Suppression.'
          >
            <CheckForm serial={feedback.serial} />
          </Section>
        </div>
        <div className='flex min-w-0 flex-col gap-4 lg:order-1 lg:col-span-8'>
          <p role='status' className='notice'>
            {feedback.notice}
          </p>
          <h2 className='m-0 border-t border-rule-strong pt-4'>Entries</h2>
          <div className='flex flex-wrap gap-x-6 gap-y-2'>
            <SelectField
              inline
              label='Reason'
              name='reason'
              value={reason ?? ''}
              options={[
                { value: '', text: 'Any reason' },
                ...SUPPRESSION_REASONS.map((value) => ({ value, text: REASON_WORD[value] })),
              ]}
              onChange={(event) => setReason(pick(SUPPRESSION_REASONS, event.target.value))}
            />
            <SelectField
              inline
              label='Address type'
              name='addressKind'
              value={addressKind ?? ''}
              options={[
                { value: '', text: 'Any type' },
                ...SUPPRESSION_ADDRESS_KINDS.map((value) => ({
                  value,
                  text: ADDRESS_KIND_WORD[value],
                })),
              ]}
              onChange={(event) =>
                setAddressKind(pick(SUPPRESSION_ADDRESS_KINDS, event.target.value))
              }
            />
            <SelectField
              inline
              label='Show'
              name='state'
              value={state}
              options={[
                { value: 'active', text: 'On Suppression' },
                { value: 'removed', text: 'Removed' },
              ]}
              onChange={(event) =>
                setState(event.target.value === 'removed' ? 'removed' : 'active')
              }
            />
          </div>
          <Paged
            noun='Suppression entries'
            emptyText='Nothing is on Suppression.'
            emptyHint='Addresses appear here when a Prospect unsubscribes, an address bounces, or you add one.'
            state={entries.state}
            present={presentConsent}
          >
            <ul
              className='m-0 list-none divide-y border-y p-0 motion-safe:animate-fade'
              aria-label='Suppression entries'
            >
              {entries.items.map((entry) => (
                <EntryItem
                  key={entry.id}
                  entry={entry}
                  onDone={feedback.done}
                  onFail={feedback.failed}
                />
              ))}
            </ul>
          </Paged>
        </div>
      </div>
    </>
  )
}

type AddressErrors = { address?: string; note?: string; form?: string }

/** Builds the one-address body the contract expects from a kind and the text typed. */
function addressBody(kind: SuppressionAddressKind, address: string) {
  if (kind === 'phone') {
    return { phone: address }
  }
  return kind === 'linkedin' ? { linkedinUrl: address } : { email: address }
}

function KindSelect(props: {
  readonly label: string
  readonly value: SuppressionAddressKind
  readonly onChange: (kind: SuppressionAddressKind) => void
}) {
  return (
    <SelectField
      label={props.label}
      name='kind'
      value={props.value}
      options={SUPPRESSION_ADDRESS_KINDS.map((value) => ({
        value,
        text: ADDRESS_KIND_WORD[value],
      }))}
      onChange={(event) => {
        const next = pick(SUPPRESSION_ADDRESS_KINDS, event.target.value)
        if (next !== undefined) {
          props.onChange(next)
        }
      }}
    />
  )
}

function AddForm(props: {
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const app = useApp()
  const [kind, setKind] = useState<SuppressionAddressKind>('email')
  const [address, setAddress] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<AddressErrors>({})
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const add = useSubmit<AddSuppressionRequest>(
    async (body) => {
      const attempt = app.keys.begin(fingerprint.suppression(JSON.stringify(body)))
      try {
        await app.consent.addSuppression(body, attempt.key)
      } catch (error) {
        attempt.failed(error)
        throw error
      }
      attempt.succeeded()
      setAddress('')
      setNote('')
      setErrors({})
      await refresh(app, 'suppression')
      props.onDone('Added to Suppression.')
    },
    {
      onError(error) {
        props.onFail()
        setErrors({ form: presentConsent(error).message })
        focusFirstError()
      },
    }
  )
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (add.pending) {
      return
    }
    props.onFail()
    const trimmed = address.trim()
    const trimmedNote = note.trim()
    const next: AddressErrors = {}
    if (trimmed === '') {
      next.address = 'Enter the address to suppress.'
    }
    const parsed = addSuppressionRequestSchema.safeParse({
      ...addressBody(kind, trimmed),
      ...(trimmedNote === '' ? {} : { note: trimmedNote }),
    })
    if (!parsed.success && next.address === undefined) {
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'note') {
          next.note = `Keep the note to ${MAX_SUPPRESSION_NOTE_LENGTH} characters or fewer.`
        } else {
          next.address = 'Check the address and try again.'
        }
      }
    }
    if (!parsed.success || next.address !== undefined) {
      setErrors(next)
      focusFirstError()
      return
    }
    setErrors({})
    add.submit(parsed.data)
  }
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className='gap-0'>
      {errors.form ? (
        <Banner kind='error' innerRef={bannerRef}>
          {errors.form}
        </Banner>
      ) : null}
      <KindSelect label='Type of address to add' value={kind} onChange={setKind} />
      <Field
        label='Address'
        name='address'
        autoComplete='off'
        value={address}
        error={errors.address}
        onChange={(event) => setAddress(event.target.value)}
      />
      <Field
        label='Note (optional)'
        name='note'
        autoComplete='off'
        value={note}
        error={errors.note}
        onChange={(event) => setNote(event.target.value)}
      />
      <div>
        <button type='submit' className='button w-full' aria-disabled={add.pending}>
          {add.pending ? 'Adding...' : 'Add to Suppression'}
        </button>
      </div>
    </form>
  )
}

function CheckForm(props: { readonly serial: number }) {
  const app = useApp()
  const [kind, setKind] = useState<SuppressionAddressKind>('email')
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [found, setFound] = useState<readonly SuppressionEntry[] | null>(null)
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  // An add or a removal changes what the list says, so an earlier answer may no longer hold.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the serial is the trigger
  useEffect(() => setFound(null), [props.serial])
  const check = useSubmit<LookupSuppressionRequest>(
    async (body) => {
      const result = await app.consent.lookupSuppression(body)
      setFound(result.items)
    },
    {
      onError(failure) {
        setFound(null)
        setError(presentConsent(failure).message)
        focusFirstError()
      },
    }
  )
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (check.pending) {
      return
    }
    setError(undefined)
    const parsed = lookupSuppressionRequestSchema.safeParse(addressBody(kind, address.trim()))
    if (address.trim() === '' || !parsed.success) {
      setFound(null)
      setError('Enter the exact address to check.')
      focusFirstError()
      return
    }
    check.submit(parsed.data)
  }
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className='gap-0'>
      <KindSelect label='Type of address to check' value={kind} onChange={setKind} />
      <Field
        label='Address to check'
        name='lookup'
        autoComplete='off'
        value={address}
        error={error}
        onChange={(event) => setAddress(event.target.value)}
      />
      <div ref={bannerRef} />
      <div>
        <button type='submit' className='button w-full' aria-disabled={check.pending}>
          {check.pending ? 'Checking...' : 'Check address'}
        </button>
      </div>
      {found === null ? null : found.length === 0 ? (
        <p className='hint'>That address is not on Suppression.</p>
      ) : (
        <section aria-label='Result of the check' className='mt-4'>
          <ul className='m-0 list-none divide-y border-y p-0'>
            {found.map((entry) => (
              <li key={entry.id} className='py-2'>
                <span className='label-mono'>{REASON_WORD[entry.reason]}</span>{' '}
                <span className='hint'>
                  {plain(entry.maskedAddress ?? '', 'an erased address')}
                  {entry.removedAt ? ' (removed)' : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </form>
  )
}

function EntryItem(props: {
  readonly entry: SuppressionEntry
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const { entry } = props
  const app = useApp()
  const label = plain(entry.maskedAddress ?? '', 'an erased address')
  const [removing, setRemoving] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [problem, setProblem] = useState<string | undefined>()
  const { formRef, focusFirstError } = useFocusOnError()
  const remove = useSubmit<string>(
    async (text) => {
      await app.consent.removeSuppression(entry.id, { reason: text })
      await refresh(app, 'suppression')
      props.onDone('Removed from Suppression.')
    },
    {
      onError(failure) {
        props.onFail()
        setProblem(presentConsent(failure).message)
      },
    }
  )
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (remove.pending) {
      return
    }
    props.onFail()
    setProblem(undefined)
    const trimmed = reason.trim()
    const parsed = removeSuppressionRequestSchema.safeParse({ reason: trimmed })
    if (trimmed === '' || !parsed.success) {
      setError('Say why this entry is being removed.')
      focusFirstError()
      return
    }
    setError(undefined)
    remove.submit(parsed.data.reason)
  }
  const canRemove = entry.removable && entry.removedAt === null
  return (
    <li className='py-4'>
      <div className='list-item-head'>
        <div className='flex min-w-0 flex-col'>
          <h3 className='item-title m-0 font-serif text-xl font-normal tracking-[-0.01em]'>
            <Untrusted value={label} />
          </h3>
          <span className='label-mono mt-1 block'>
            {REASON_WORD[entry.reason]} · {ADDRESS_KIND_WORD[entry.addressKind]}
          </span>
          <span className='hint'>
            Added <When iso={entry.createdAt} />
          </span>
          {entry.removedAt ? (
            <span className='hint'>
              Removed <When iso={entry.removedAt} />
              {entry.removalReason ? (
                <>
                  {': '}
                  <Untrusted value={entry.removalReason} />
                </>
              ) : null}
            </span>
          ) : null}
        </div>
        {canRemove ? (
          <div className='row-actions'>
            <button
              type='button'
              className='button button-quiet'
              aria-label={`Remove ${label}`}
              aria-expanded={removing}
              aria-controls={`${entry.id}-remove`}
              onClick={() => setRemoving((open) => !open)}
            >
              Remove
            </button>
          </div>
        ) : null}
      </div>
      {problem ? (
        <p className='field-error' role='alert'>
          <strong>Error:</strong> {problem}
        </p>
      ) : null}
      {removing && canRemove ? (
        <form
          ref={formRef}
          id={`${entry.id}-remove`}
          noValidate
          onSubmit={onSubmit}
          className='mt-4 max-w-none gap-0 border-l-2 border-rule-strong pl-4 motion-safe:animate-rise'
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setRemoving(false)
            }
          }}
        >
          <Field
            label='Reason for removing'
            name='reason'
            autoComplete='off'
            hint='Kept with the entry, so the next person can see why.'
            value={reason}
            error={error}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className='row-actions'>
            <button type='submit' className='button' aria-disabled={remove.pending}>
              {remove.pending ? 'Removing...' : 'Remove entry'}
            </button>
            <button
              type='button'
              className='button button-quiet'
              onClick={() => setRemoving(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </li>
  )
}
