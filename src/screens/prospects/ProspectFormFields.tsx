import { useState } from 'react'
import { companyName, FIELD_LABEL } from '~/data/prospects'
import { useProspectCompany, useProspectCompanySearch } from '~/data/queries'
import { Field } from '~/ui/Field'
import { SelectField } from '~/ui/SelectField'
import { useSettled } from '~/ui/useSettled'

/** The text of the six identity fields of a Prospect while it is edited. */
export type IdentityValues = {
  readonly firstName: string
  readonly lastName: string
  readonly jobTitle: string
  readonly email: string
  readonly phone: string
  readonly linkedinUrl: string
}

/** The names of the identity fields as a form keeps them. */
export type IdentityName = keyof IdentityValues

/** The error text to show under each identity field. */
export type IdentityErrors = Partial<Record<IdentityName, string>>

const AUTOCOMPLETE: Record<IdentityName, string> = {
  firstName: 'off',
  lastName: 'off',
  jobTitle: 'off',
  email: 'off',
  phone: 'off',
  linkedinUrl: 'off',
}

/** The six identity fields of a Prospect as labelled inputs, each with its error tied to it. */
export function IdentityFields(props: {
  readonly values: IdentityValues
  readonly errors: IdentityErrors
  readonly onChange: (name: IdentityName, value: string) => void
}) {
  const names: readonly IdentityName[] = [
    'firstName',
    'lastName',
    'jobTitle',
    'email',
    'phone',
    'linkedinUrl',
  ]
  return (
    <>
      {names.map((name) => (
        <Field
          key={name}
          label={FIELD_LABEL[name]}
          name={name}
          type={name === 'email' ? 'email' : name === 'phone' ? 'tel' : 'text'}
          autoComplete={AUTOCOMPLETE[name]}
          value={props.values[name]}
          error={props.errors[name]}
          onChange={(event) => props.onChange(name, event.target.value)}
        />
      ))}
    </>
  )
}

/** A choice of Prospect Company: none, or one found by typing part of its name (searched on the server). */
export function CompanyChoice(props: {
  readonly value: string
  readonly error?: string | undefined
  readonly onChange: (value: string) => void
}) {
  const [term, setTerm] = useState('')
  const found = useProspectCompanySearch(useSettled(term.trim()))
  const chosen = useProspectCompany(props.value === '' ? null : props.value)
  const listed = found.data?.items ?? []
  const options = [{ value: '', text: 'None' }]
  if (props.value !== '' && !listed.some((company) => company.id === props.value)) {
    // The current choice stays selectable whatever the search shows.
    options.push({
      value: props.value,
      text: chosen.data ? companyName(chosen.data) : 'Prospect Company',
    })
  }
  options.push(...listed.map((company) => ({ value: company.id, text: companyName(company) })))
  return (
    <>
      <Field
        label='Search Prospect Companies'
        autoComplete='off'
        hint={
          found.data?.nextCursor
            ? `The first ${listed.length} matches are listed. Type more of the name to narrow them.`
            : 'Type part of a name to find it.'
        }
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
          }
        }}
      />
      <SelectField
        label='Prospect Company'
        name='companyId'
        value={props.value}
        error={props.error}
        onChange={(event) => props.onChange(event.target.value)}
        options={options}
      />
    </>
  )
}
