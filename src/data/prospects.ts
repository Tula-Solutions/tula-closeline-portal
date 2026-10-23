import type { Prospect, ProspectCompany, ProspectFieldName } from 'tula-closeline-contract'
import { plain } from '~/ui/plain'

/** The fields a Prospect carries a Source for, in the order they are shown. */
export const FIELD_ORDER: readonly ProspectFieldName[] = [
  'firstName',
  'lastName',
  'jobTitle',
  'email',
  'phone',
  'linkedinUrl',
]

/** What each field is called on screen. */
export const FIELD_LABEL: Readonly<Record<ProspectFieldName, string>> = {
  firstName: 'First name',
  lastName: 'Last name',
  jobTitle: 'Job title',
  email: 'Email address',
  phone: 'Phone number',
  linkedinUrl: 'LinkedIn address',
}

/** The Sources a person can narrow the list by, as the list sends them. */
export const SOURCE_CHOICES: readonly { readonly value: string; readonly text: string }[] = [
  { value: '', text: 'Any Source' },
  { value: 'manual', text: 'Manual entry' },
  { value: 'import', text: 'Import' },
  { value: 'crm:hubspot', text: 'HubSpot' },
  { value: 'crm:salesforce', text: 'Salesforce' },
  { value: 'form', text: 'Form' },
]

/** A Source in words: the fixed ones by name, an enrichment provider as "Enrichment (name)". */
export function sourceLabel(source: string): string {
  const known = SOURCE_CHOICES.find((choice) => choice.value === source && source !== '')
  if (known) {
    return known.text
  }
  if (source.startsWith('enrichment:')) {
    return `Enrichment (${plain(source.slice('enrichment:'.length), 'unnamed provider')})`
  }
  return 'Another Source'
}

/** The text of one field of a Prospect, or an empty string when it has none. */
export function fieldValue(prospect: Prospect, name: ProspectFieldName): string {
  return prospect.fields[name]?.value ?? ''
}

/** What a Prospect is called: the first and last name, else the email address, else a plain stand-in. */
export function prospectName(prospect: Prospect): string {
  const full = plain(
    `${fieldValue(prospect, 'firstName')} ${fieldValue(prospect, 'lastName')}`.trim()
  )
  return full || plain(fieldValue(prospect, 'email')) || 'Unnamed Prospect'
}

/** A Prospect Company's name. */
export function companyName(company: ProspectCompany): string {
  return plain(company.fields.name.value, 'Unnamed Prospect Company')
}

/** Tags typed as one line: split on commas, trimmed, without blanks or repeats. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>()
  for (const part of text.split(',')) {
    const tag = part.trim()
    if (tag !== '') {
      seen.add(tag)
    }
  }
  return [...seen]
}
