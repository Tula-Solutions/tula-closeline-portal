import { type FormEvent, type ReactNode, useId, useState } from 'react'
import {
  COMPANY_SIZE_BANDS,
  type CreateRoutingRuleRequest,
  createRoutingRuleRequestSchema,
  MAX_ELIGIBLE_REPS,
  type RoutingRule,
} from 'tula-closeline-contract'
import { Label } from '~/components/ui/label'
import { useBookingTypes, useMembersByIds, useTeamOptions } from '~/data/queries'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
import { OwnerCombobox } from '~/ui/OwnerCombobox'
import { plain } from '~/ui/plain'
import { SelectField } from '~/ui/SelectField'
import { Untrusted } from '~/ui/Untrusted'
import { useFocusOnError } from '~/ui/useFocusOnError'

/** What the person has typed or chosen in the rule form, before it becomes a request body. */
export type Draft = {
  readonly name: string
  readonly isDefault: boolean
  readonly countries: string
  readonly regions: string
  readonly sources: string
  readonly bands: readonly string[]
  readonly accountOwners: readonly string[]
  readonly bookingTypeIds: readonly string[]
  readonly kind: 'rep' | 'team' | 'pool'
  readonly repId: string
  readonly teamId: string
  readonly poolIds: readonly string[]
}

/** An empty form: a new rule that sends to a Rep. */
export const EMPTY: Draft = {
  name: '',
  isDefault: false,
  countries: '',
  regions: '',
  sources: '',
  bands: [],
  accountOwners: [],
  bookingTypeIds: [],
  kind: 'rep',
  repId: '',
  teamId: '',
  poolIds: [],
}

const list = (values: readonly string[] | undefined) => (values ?? []).join(', ')

/** The form fields of an existing rule, for editing it. */
export function draftOf(rule: RoutingRule): Draft {
  const { conditions, target } = rule
  return {
    name: rule.name,
    isDefault: rule.isDefault,
    countries: list(conditions.countries),
    regions: list(conditions.regions),
    sources: list(conditions.sources),
    bands: conditions.companySizeBands ?? [],
    accountOwners: conditions.accountOwnerMembershipIds ?? [],
    bookingTypeIds: conditions.bookingTypeIds ?? [],
    kind: target.kind,
    repId: target.kind === 'rep' ? target.membershipId : '',
    teamId: target.kind === 'team' ? target.teamId : '',
    poolIds: target.kind === 'pool' ? target.membershipIds : [],
  }
}

type FieldName = 'name' | 'conditions' | 'countries' | 'regions' | 'sources' | 'target'

const FIELD_WORDS: Record<FieldName, string> = {
  name: 'Enter a name, such as Enterprise in Europe.',
  conditions: 'Add at least one condition, or make this the default rule.',
  countries: 'Enter two-letter country codes, separated by commas, such as US, GB.',
  regions: 'Enter regions separated by commas, each up to 100 characters.',
  sources: 'Enter sources separated by commas, such as form, import, crm:hubspot.',
  target: 'Choose where a match goes: one Rep, a Team, or 2 to 20 different Reps.',
}

const FIELDS = Object.keys(FIELD_WORDS) as FieldName[]

type DraftErrors = Partial<Record<FieldName, string>>

const split = (text: string) =>
  text
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')

/** A one-key object when there are values, so an empty condition is left out of the body. */
const given = (key: string, values: readonly string[]) =>
  values.length > 0 ? { [key]: values } : {}

/** Validates a draft with the contract's schema; the words for each field that fails, or the body. */
function check(draft: Draft): { body: CreateRoutingRuleRequest } | { errors: DraftErrors } {
  const conditions = draft.isDefault
    ? {}
    : {
        ...given('countries', split(draft.countries.toUpperCase())),
        ...given('regions', split(draft.regions)),
        ...given('sources', split(draft.sources)),
        ...given('companySizeBands', draft.bands),
        ...given('accountOwnerMembershipIds', draft.accountOwners),
        ...given('bookingTypeIds', draft.bookingTypeIds),
      }
  const target =
    draft.kind === 'rep'
      ? { kind: 'rep', membershipId: draft.repId }
      : draft.kind === 'team'
        ? { kind: 'team', teamId: draft.teamId }
        : { kind: 'pool', membershipIds: draft.poolIds }
  const parsed = createRoutingRuleRequestSchema.safeParse({
    name: draft.name,
    conditions,
    target,
    isDefault: draft.isDefault,
  })
  if (parsed.success) {
    return { body: parsed.data }
  }
  const errors: DraftErrors = {}
  for (const issue of parsed.error.issues) {
    const [area, key] = issue.path
    const where = area === 'conditions' ? key : area
    const field = FIELDS.find((known) => known === where) ?? 'conditions'
    errors[field] = FIELD_WORDS[field]
  }
  return { errors }
}

/** Checkboxes in a fieldset: `selected` holds the values ticked. */
function CheckList(props: {
  readonly legend: string
  readonly options: readonly { readonly value: string; readonly text: string }[]
  readonly selected: readonly string[]
  readonly onChange: (next: readonly string[]) => void
  readonly children?: ReactNode
}) {
  const id = useId()
  return (
    <fieldset className='field mb-4 flex min-w-0 flex-col gap-2 border-0 p-0'>
      <legend className='mb-1 text-sm font-medium'>{props.legend}</legend>
      {props.options.map((option) => (
        <label
          key={option.value}
          className='flex items-center gap-2 text-sm'
          htmlFor={`${id}-${option.value}`}
        >
          <input
            id={`${id}-${option.value}`}
            type='checkbox'
            checked={props.selected.includes(option.value)}
            onChange={(event) =>
              props.onChange(
                event.target.checked
                  ? [...props.selected, option.value]
                  : props.selected.filter((value) => value !== option.value)
              )
            }
          />
          {option.text}
        </label>
      ))}
      {props.children}
    </fieldset>
  )
}

/** A short list of members: pick one at a time from a searchable field; each can be removed. */
function MemberList(props: {
  readonly label: string
  readonly ids: readonly string[]
  readonly max: number
  readonly onChange: (next: readonly string[]) => void
  readonly error?: string | undefined
}) {
  const { ids, max } = props
  const [picked, setPicked] = useState<Readonly<Record<string, string>>>({})
  const found = useMembersByIds(ids)
  const nameOf = (id: string) => {
    const member = found.get(id)
    return member === undefined
      ? (picked[id] ?? 'Rep')
      : plain(member.name ?? member.email, 'Unnamed member')
  }
  return (
    <div className='mb-4'>
      <OwnerCombobox
        label={props.label}
        anyText={ids.length >= max ? `Up to ${max} are chosen` : 'Search to add a Rep'}
        value=''
        valueName=''
        enabled={ids.length < max}
        memberRole='rep'
        error={props.error}
        onChange={(id, name) => {
          if (id !== '' && !ids.includes(id) && ids.length < max) {
            setPicked((now) => ({ ...now, [id]: name }))
            props.onChange([...ids, id])
          }
        }}
      />
      {ids.length > 0 ? (
        <ul
          className='m-0 mt-2 list-none divide-y border-y p-0'
          aria-label={`${props.label} chosen`}
        >
          {ids.map((id) => (
            <li key={id} className='flex items-center justify-between gap-2 py-1.5 text-sm'>
              <Untrusted value={nameOf(id)} />
              <button
                type='button'
                className='button button-quiet'
                aria-label={`Remove ${nameOf(id)} from ${props.label}`}
                onClick={() => props.onChange(ids.filter((other) => other !== id))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** The fields of a Routing Rule, used to add one and to change one; it validates, then hands over the body. */
export function RuleForm(props: {
  readonly idPrefix: string
  readonly id?: string
  readonly initial: Draft
  readonly submitLabel: string
  readonly pendingLabel: string
  readonly pending: boolean
  readonly formError: string | undefined
  readonly canPickBookingTypes: boolean
  readonly onValid: (body: CreateRoutingRuleRequest) => void
  readonly onInvalid: () => void
  readonly onCancel?: () => void
  readonly ariaLabel: string
  readonly className?: string
}) {
  const [draft, setDraft] = useState(props.initial)
  const [errors, setErrors] = useState<DraftErrors>({})
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const teams = useTeamOptions(draft.kind === 'team')
  const bookingTypes = useBookingTypes(props.canPickBookingTypes && !draft.isDefault)
  const text =
    (key: 'name' | 'countries' | 'regions' | 'sources') =>
    (event: { readonly target: { readonly value: string } }) =>
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
  const prefix = props.idPrefix
  const loadedTypes = bookingTypes.items.filter((type) => type.state === 'active')
  const typeOptions = [
    ...loadedTypes.map((type) => ({ value: type.id, text: plain(type.name, 'Booking Type') })),
    ...draft.bookingTypeIds
      .filter((id) => !loadedTypes.some((type) => type.id === id))
      .map((id) => ({ value: id, text: 'A Booking Type not listed here' })),
  ]
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
        name={`${prefix}-name`}
        autoComplete='off'
        value={draft.name}
        error={errors.name}
        onChange={text('name')}
      />
      <div className='field mb-4 flex items-center gap-2'>
        <input
          id={`${prefix}-default`}
          type='checkbox'
          checked={draft.isDefault}
          onChange={(event) => setDraft((now) => ({ ...now, isDefault: event.target.checked }))}
        />
        <Label htmlFor={`${prefix}-default`}>Default rule: matches anyone, tried last</Label>
      </div>
      {draft.isDefault ? null : (
        <>
          <p className='label-mono m-0 mb-2'>When a Prospect matches all of these</p>
          {errors.conditions ? (
            <p className='field-error' role='alert'>
              <strong>Error:</strong> {errors.conditions}
            </p>
          ) : null}
          <Field
            label='Countries'
            name={`${prefix}-countries`}
            autoComplete='off'
            hint='Two-letter codes, separated by commas.'
            value={draft.countries}
            error={errors.countries}
            onChange={text('countries')}
          />
          <Field
            label='Regions'
            name={`${prefix}-regions`}
            autoComplete='off'
            value={draft.regions}
            error={errors.regions}
            onChange={text('regions')}
          />
          <Field
            label='Sources'
            name={`${prefix}-sources`}
            autoComplete='off'
            hint='Such as form, import, manual, crm:hubspot.'
            value={draft.sources}
            error={errors.sources}
            onChange={text('sources')}
          />
          <CheckList
            legend='Company size'
            options={COMPANY_SIZE_BANDS.map((band) => ({ value: band, text: band }))}
            selected={draft.bands}
            onChange={(bands) => setDraft((now) => ({ ...now, bands }))}
          />
          <MemberList
            label='Account owners'
            ids={draft.accountOwners}
            max={50}
            onChange={(accountOwners) => setDraft((now) => ({ ...now, accountOwners }))}
          />
          {props.canPickBookingTypes ? (
            <CheckList
              legend='Booking Types'
              options={typeOptions}
              selected={draft.bookingTypeIds}
              onChange={(bookingTypeIds) => setDraft((now) => ({ ...now, bookingTypeIds }))}
            >
              {bookingTypes.state.hasNextPage ? (
                <button
                  type='button'
                  className='button button-quiet self-start'
                  onClick={() => bookingTypes.state.fetchNextPage()}
                >
                  Load more Booking Types
                </button>
              ) : null}
            </CheckList>
          ) : (
            <p className='hint'>An Owner or Admin sets Booking Type conditions.</p>
          )}
        </>
      )}
      <p className='label-mono m-0 mb-2'>Send a match to</p>
      <SelectField
        label='Target'
        name={`${prefix}-kind`}
        value={draft.kind}
        options={[
          { value: 'rep', text: 'One Rep' },
          { value: 'team', text: 'A Team, in turn' },
          { value: 'pool', text: 'A pool of Reps, in turn' },
        ]}
        error={errors.target}
        onChange={(event) =>
          setDraft((now) => ({
            ...now,
            kind:
              event.target.value === 'team'
                ? 'team'
                : event.target.value === 'pool'
                  ? 'pool'
                  : 'rep',
          }))
        }
      />
      {draft.kind === 'rep' ? (
        <OwnerCombobox
          label='Rep'
          anyText='Choose a Rep'
          value={draft.repId}
          valueName=''
          enabled
          memberRole='rep'
          onChange={(repId) => setDraft((now) => ({ ...now, repId }))}
        />
      ) : null}
      {draft.kind === 'team' ? (
        <SelectField
          label='Team'
          name={`${prefix}-team`}
          value={draft.teamId}
          placeholder='Choose a Team'
          options={teams.items.map((team) => ({ value: team.id, text: plain(team.name, 'Team') }))}
          onChange={(event) => setDraft((now) => ({ ...now, teamId: event.target.value }))}
        />
      ) : null}
      {draft.kind === 'pool' ? (
        <MemberList
          label='Pool of Reps'
          ids={draft.poolIds}
          max={MAX_ELIGIBLE_REPS}
          onChange={(poolIds) => setDraft((now) => ({ ...now, poolIds }))}
        />
      ) : null}
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
