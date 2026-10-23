import { Link, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useRef, useState } from 'react'
import {
  type CreateProspectRequest,
  createProspectRequestSchema,
  MAX_PROSPECT_NOTES_LENGTH,
  MAX_PROSPECT_TAG_LENGTH,
  MAX_PROSPECT_TAGS,
  membershipIdSchema,
  prospectCompanyIdSchema,
} from 'tula-closeline-contract'
import { fingerprint } from '~/api/idempotency'
import { presentProspect } from '~/api/prospect-messages'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { can } from '~/data/permissions'
import { FIELD_ORDER, parseTags } from '~/data/prospects'
import { refresh, useMembersFirstPage, useProspectCompanies } from '~/data/queries'
import { useRole } from '~/data/session-role'
import {
  CompanyChoice,
  type IdentityErrors,
  IdentityFields,
  type IdentityName,
  type IdentityValues,
} from '~/screens/prospects/ProspectFormFields'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
import { plain } from '~/ui/plain'
import { SelectField } from '~/ui/SelectField'
import { TextAreaField } from '~/ui/TextAreaField'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'

const BLANK: IdentityValues = {
  firstName: '',
  lastName: '',
  jobTitle: '',
  email: '',
  phone: '',
  linkedinUrl: '',
}

const RULE: Record<IdentityName, string> = {
  firstName: 'Enter a first name of up to 100 characters.',
  lastName: 'Enter a last name of up to 100 characters.',
  jobTitle: 'Enter a job title of up to 200 characters.',
  email: 'Enter a valid email address.',
  phone: 'Enter a valid phone number.',
  linkedinUrl: 'Enter a valid LinkedIn address.',
}

type Errors = IdentityErrors & {
  form?: string
  owner?: string
  company?: string
  newCompany?: string
  tags?: string
  notes?: string
}

/** Adds a Prospect by hand. A Rep owns what they add; an Owner or Admin may name another owner. */
export function NewProspectScreen() {
  useDocumentTitle('Add a Prospect')
  const app = useApp()
  const role = useRole()
  const navigate = useNavigate()
  const companies = useProspectCompanies()
  const chooseOwner = role !== null && can.assignProspectOwner(role)
  const members = useMembersFirstPage(chooseOwner)
  const [values, setValues] = useState<IdentityValues>(BLANK)
  const [companyId, setCompanyId] = useState('')
  const [newCompany, setNewCompany] = useState('')
  const [owner, setOwner] = useState('')
  const [tags, setTags] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  // A Prospect Company created for this form is reused if the Prospect itself then fails.
  const made = useRef<{ name: string; id: string } | null>(null)
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const create = useSubmit<{ body: CreateProspectRequest; companyName: string }>(
    async ({ body, companyName }) => {
      let withCompany = body
      if (companyName !== '') {
        if (made.current?.name !== companyName) {
          const attempt = app.keys.begin(fingerprint.prospectCompany(companyName))
          try {
            const company = await app.core.createProspectCompany({ name: companyName }, attempt.key)
            made.current = { name: companyName, id: company.id }
          } catch (error) {
            attempt.failed(error)
            throw error
          }
          attempt.succeeded()
          await refresh(app, 'prospectCompanies')
        }
        const id = prospectCompanyIdSchema.parse(made.current.id)
        withCompany = { ...body, companyId: id }
      }
      const key = fingerprint.prospect(JSON.stringify(withCompany))
      const attempt = app.keys.begin(key)
      let prospect: Awaited<ReturnType<typeof app.core.createProspect>>
      try {
        prospect = await app.core.createProspect(withCompany, attempt.key)
      } catch (error) {
        attempt.failed(error)
        throw error
      }
      attempt.succeeded()
      await refresh(app, 'prospects')
      await navigate({ to: '/prospects/$prospectId', params: { prospectId: prospect.id } })
    },
    {
      onError(error) {
        const shown = presentProspect(error)
        const field = shown.field
        setErrors(
          field === 'email' || field === 'phone' || field === 'linkedinUrl'
            ? { [field]: shown.message }
            : field === 'owner'
              ? { owner: shown.message }
              : field === 'company'
                ? { newCompany: shown.message }
                : { form: shown.message }
        )
        focusFirstError()
      },
    }
  )
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (create.pending) {
      return
    }
    const draft: Record<string, unknown> = {}
    for (const name of FIELD_ORDER) {
      if (values[name].trim() !== '') {
        draft[name] = values[name]
      }
    }
    if (companyId !== '' && newCompany.trim() === '') {
      draft.companyId = companyId
    }
    if (chooseOwner && owner !== '') {
      draft.ownerMembershipId = owner
    }
    const list = parseTags(tags)
    if (list.length > 0) {
      draft.tags = list
    }
    if (notes.trim() !== '') {
      draft.notes = notes
    }
    const parsed = createProspectRequestSchema.safeParse(draft)
    if (!parsed.success) {
      const next: Errors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (typeof key === 'string' && key in RULE) {
          next[key as IdentityName] = RULE[key as IdentityName]
        } else if (key === 'tags') {
          next.tags = `Use up to ${MAX_PROSPECT_TAGS} tags of up to ${MAX_PROSPECT_TAG_LENGTH} characters each, separated by commas.`
        } else if (key === 'notes') {
          next.notes = `Keep notes to ${MAX_PROSPECT_NOTES_LENGTH} characters.`
        } else {
          next.form = 'Enter a name, an email address, a phone number or a LinkedIn address.'
        }
      }
      setErrors(next)
      focusFirstError()
      return
    }
    setErrors({})
    create.submit({ body: parsed.data, companyName: newCompany.trim() })
  }
  return (
    <>
      <PageHeader
        eyebrow='Prospects'
        title='Add a Prospect'
        description='Enter at least a name, an email address, a phone number or a LinkedIn address. The Source of every detail is recorded as manual entry.'
        actions={
          <Link to='/prospects' className='button button-quiet'>
            Back to Prospects
          </Link>
        }
      />
      <form
        ref={formRef}
        onSubmit={onSubmit}
        noValidate
        aria-label='Add a Prospect'
        className='max-w-xl'
      >
        {errors.form ? (
          <Banner kind='error' innerRef={bannerRef}>
            {errors.form}
          </Banner>
        ) : null}
        <IdentityFields
          values={values}
          errors={errors}
          onChange={(name, value) => setValues((now) => ({ ...now, [name]: value }))}
        />
        <CompanyChoice
          companies={companies.data?.items ?? []}
          value={companyId}
          onChange={setCompanyId}
        />
        <Field
          label='Or add a new Prospect Company'
          name='newCompany'
          autoComplete='off'
          hint='If you fill this in, it is used instead of the choice above.'
          value={newCompany}
          error={errors.newCompany}
          onChange={(event) => setNewCompany(event.target.value)}
        />
        {chooseOwner ? (
          <SelectField
            label='Owner'
            name='ownerMembershipId'
            value={owner}
            error={errors.owner}
            onChange={(event) => {
              const chosen = membershipIdSchema.safeParse(event.target.value)
              setOwner(chosen.success ? chosen.data : '')
            }}
            options={[
              { value: '', text: 'Me' },
              ...members.items
                .filter((member) => member.role === 'rep' || member.role === 'manager')
                .map((member) => ({
                  value: member.id,
                  text: plain(member.name ?? member.email, 'Unnamed member'),
                })),
            ]}
          />
        ) : null}
        <Field
          label='Tags'
          name='tags'
          autoComplete='off'
          hint='Separate tags with commas.'
          value={tags}
          error={errors.tags}
          onChange={(event) => setTags(event.target.value)}
        />
        <TextAreaField
          label='Notes'
          name='notes'
          value={notes}
          error={errors.notes}
          onChange={(event) => setNotes(event.target.value)}
        />
        <button type='submit' className='button' aria-disabled={create.pending}>
          {create.pending ? 'Adding...' : 'Add Prospect'}
        </button>
      </form>
    </>
  )
}
