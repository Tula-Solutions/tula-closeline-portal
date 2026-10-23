import { getRouteApi, Link } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import {
  MAX_PROSPECT_NOTES_LENGTH,
  MAX_PROSPECT_TAG_LENGTH,
  MAX_PROSPECT_TAGS,
  type Prospect,
  type ProspectFieldName,
  type UpdateProspectRequest,
  updateProspectRequestSchema,
} from 'tula-closeline-contract'
import { presentProspect } from '~/api/prospect-messages'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { Section } from '~/components/app/section'
import {
  companyName,
  FIELD_LABEL,
  FIELD_ORDER,
  fieldValue,
  parseTags,
  prospectName,
  sourceLabel,
} from '~/data/prospects'
import { refresh, useProspect, useProspectCompanies } from '~/data/queries'
import {
  CompanyChoice,
  type IdentityErrors,
  IdentityFields,
  type IdentityName,
  type IdentityValues,
} from '~/screens/prospects/ProspectFormFields'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
import { SelectField } from '~/ui/SelectField'
import { TextAreaField } from '~/ui/TextAreaField'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useFeedback } from '~/ui/useFeedback'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'
import { When } from '~/ui/When'

const route = getRouteApi('/_app/prospects/$prospectId')

/** One Prospect: each detail with its Source on demand, an edit form, and Notes and tags. */
export function ProspectScreen() {
  const { prospectId } = route.useParams()
  const prospect = useProspect(prospectId)
  const feedback = useFeedback()
  const name = prospect.data ? prospectName(prospect.data) : 'Prospect'
  useDocumentTitle(name)
  if (prospect.isPending) {
    return (
      <>
        <PageHeader eyebrow='Prospect' title='Loading...' />
        <p role='status' className='sr-only'>
          Loading the Prospect...
        </p>
      </>
    )
  }
  if (prospect.isError) {
    return (
      <>
        <PageHeader eyebrow='Prospect' title='This Prospect cannot be shown' />
        <Banner kind='error'>{presentProspect(prospect.error).message}</Banner>
        <p>
          <Link to='/prospects'>Back to Prospects</Link>
        </p>
      </>
    )
  }
  const record = prospect.data
  return (
    <>
      <PageHeader
        eyebrow='Prospect'
        title={<Untrusted value={name} />}
        description={`${record.status === 'active' ? 'Active' : 'Archived'}. Added by ${sourceLabel(record.source)}.`}
        actions={
          <Link to='/prospects' className='button button-quiet'>
            Back to Prospects
          </Link>
        }
      />
      <p role='status' className='notice'>
        {feedback.notice}
      </p>
      <div className='page-stack'>
        <Details prospect={record} />
        <Section
          id='edit-prospect'
          title='Edit details'
          description='Change only what is wrong; the rest stays as it is.'
        >
          <EditForm
            key={JSON.stringify([valuesOf(record), record.companyId, record.status])}
            prospect={record}
            onDone={feedback.done}
            onFail={feedback.failed}
          />
        </Section>
        <Section id='notes-tags' title='Notes and tags' description='Private to your Organization.'>
          <NotesForm
            key={JSON.stringify([record.tags, record.notes])}
            prospect={record}
            onDone={feedback.done}
            onFail={feedback.failed}
          />
        </Section>
      </div>
    </>
  )
}

function Details(props: { readonly prospect: Prospect }) {
  const { prospect } = props
  const companies = useProspectCompanies()
  const company = companies.data?.items.find((item) => item.id === prospect.companyId)
  const [open, setOpen] = useState<ReadonlySet<ProspectFieldName>>(new Set())
  const toggle = (name: ProspectFieldName) =>
    setOpen((now) => {
      const next = new Set(now)
      if (!next.delete(name)) {
        next.add(name)
      }
      return next
    })
  return (
    <section aria-labelledby='details-heading'>
      <h2 id='details-heading' className='sr-only'>
        Details
      </h2>
      <dl>
        {FIELD_ORDER.map((name) => {
          const field = prospect.fields[name]
          const rowId = `source-${name}`
          return (
            <div key={name} className='dl-group'>
              <dt>{FIELD_LABEL[name]}</dt>
              <dd>
                {field === undefined ? (
                  <span className='text-muted-foreground'>Not set</span>
                ) : (
                  <>
                    <Untrusted value={field.value} />{' '}
                    <button
                      type='button'
                      className='button button-quiet'
                      aria-expanded={open.has(name)}
                      aria-controls={rowId}
                      onClick={() => toggle(name)}
                    >
                      Source<span className='sr-only'> of {FIELD_LABEL[name]}</span>
                    </button>
                  </>
                )}
              </dd>
              {field !== undefined && open.has(name) ? (
                <dd id={rowId} className='source-row'>
                  <span className='label-mono'>Source</span> {sourceLabel(field.source)}
                  {field.sourceRef !== null ? (
                    <>
                      {' '}
                      · Reference <Untrusted value={field.sourceRef} />
                    </>
                  ) : null}{' '}
                  · Set <When iso={field.setAt} />
                </dd>
              ) : null}
            </div>
          )
        })}
        <div className='dl-group'>
          <dt>Prospect Company</dt>
          <dd>
            {prospect.companyId === null ? (
              <span className='text-muted-foreground'>None</span>
            ) : (
              <>
                <Untrusted value={company ? companyName(company) : 'Prospect Company'} />{' '}
                <Link to='/prospects' search={{ company: prospect.companyId }}>
                  Prospects at this Prospect Company
                </Link>
              </>
            )}
          </dd>
        </div>
      </dl>
    </section>
  )
}

function valuesOf(prospect: Prospect): IdentityValues {
  return {
    firstName: fieldValue(prospect, 'firstName'),
    lastName: fieldValue(prospect, 'lastName'),
    jobTitle: fieldValue(prospect, 'jobTitle'),
    email: fieldValue(prospect, 'email'),
    phone: fieldValue(prospect, 'phone'),
    linkedinUrl: fieldValue(prospect, 'linkedinUrl'),
  }
}

const RULE: Record<IdentityName, string> = {
  firstName: 'Enter a first name of up to 100 characters.',
  lastName: 'Enter a last name of up to 100 characters.',
  jobTitle: 'Enter a job title of up to 200 characters.',
  email: 'Enter a valid email address.',
  phone: 'Enter a valid phone number.',
  linkedinUrl: 'Enter a valid LinkedIn address.',
}

function EditForm(props: {
  readonly prospect: Prospect
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const { prospect } = props
  const app = useApp()
  const companies = useProspectCompanies()
  const initial = valuesOf(prospect)
  const [values, setValues] = useState<IdentityValues>(initial)
  const [companyId, setCompanyId] = useState(prospect.companyId ?? '')
  const [status, setStatus] = useState<string>(prospect.status)
  const [errors, setErrors] = useState<IdentityErrors & { form?: string; company?: string }>({})
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const save = useSubmit<UpdateProspectRequest>(
    async (body) => {
      await app.core.updateProspect(prospect.id, body)
      await refresh(app, 'prospects')
      props.onDone('Details saved.')
    },
    {
      onError(error) {
        const shown = presentProspect(error)
        props.onFail()
        const field = shown.field
        setErrors(
          field === 'email' || field === 'phone' || field === 'linkedinUrl'
            ? { [field]: shown.message }
            : field === 'company'
              ? { company: shown.message }
              : { form: shown.message }
        )
        focusFirstError()
      },
    }
  )
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (save.pending) {
      return
    }
    props.onFail()
    const draft: Record<string, string | null> = {}
    for (const name of FIELD_ORDER) {
      if (values[name] !== initial[name]) {
        draft[name] = values[name].trim() === '' ? null : values[name]
      }
    }
    if (companyId !== (prospect.companyId ?? '')) {
      draft.companyId = companyId === '' ? null : companyId
    }
    if (status !== prospect.status) {
      draft.status = status
    }
    if (Object.keys(draft).length === 0) {
      setErrors({ form: 'Change a detail first, then save.' })
      focusFirstError()
      return
    }
    const parsed = updateProspectRequestSchema.safeParse(draft)
    if (!parsed.success) {
      const next: IdentityErrors & { form?: string } = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (typeof key === 'string' && key in RULE) {
          next[key as IdentityName] = RULE[key as IdentityName]
        } else {
          next.form = 'Check the details you entered and try again.'
        }
      }
      setErrors(next)
      focusFirstError()
      return
    }
    setErrors({})
    save.submit(parsed.data)
  }
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-labelledby='edit-prospect-heading'>
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
        error={errors.company}
        onChange={setCompanyId}
      />
      <SelectField
        label='Status'
        name='status'
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        options={[
          { value: 'active', text: 'Active' },
          { value: 'archived', text: 'Archived' },
        ]}
      />
      <button type='submit' className='button' aria-disabled={save.pending}>
        {save.pending ? 'Saving...' : 'Save changes'}
      </button>
    </form>
  )
}

function NotesForm(props: {
  readonly prospect: Prospect
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const { prospect } = props
  const app = useApp()
  const [tags, setTags] = useState(prospect.tags.join(', '))
  const [notes, setNotes] = useState(prospect.notes ?? '')
  const [errors, setErrors] = useState<{ tags?: string; notes?: string; form?: string }>({})
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const save = useSubmit<UpdateProspectRequest>(
    async (body) => {
      await app.core.updateProspect(prospect.id, body)
      await refresh(app, 'prospects')
      props.onDone('Notes and tags saved.')
    },
    {
      onError(error) {
        props.onFail()
        setErrors({ form: presentProspect(error).message })
        focusFirstError()
      },
    }
  )
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (save.pending) {
      return
    }
    props.onFail()
    const list = parseTags(tags)
    const body: UpdateProspectRequest = {
      tags: list,
      notes: notes.trim() === '' ? null : notes,
    }
    const parsed = updateProspectRequestSchema.safeParse(body)
    if (!parsed.success) {
      const next: { tags?: string; notes?: string; form?: string } = {}
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'tags') {
          next.tags = `Use up to ${MAX_PROSPECT_TAGS} tags of up to ${MAX_PROSPECT_TAG_LENGTH} characters each, separated by commas.`
        } else if (issue.path[0] === 'notes') {
          next.notes = `Keep notes to ${MAX_PROSPECT_NOTES_LENGTH} characters.`
        } else {
          next.form = 'Check the details you entered and try again.'
        }
      }
      setErrors(next)
      focusFirstError()
      return
    }
    setErrors({})
    save.submit(parsed.data)
  }
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-labelledby='notes-tags-heading'>
      {errors.form ? (
        <Banner kind='error' innerRef={bannerRef}>
          {errors.form}
        </Banner>
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
      <button type='submit' className='button' aria-disabled={save.pending}>
        {save.pending ? 'Saving...' : 'Save notes and tags'}
      </button>
    </form>
  )
}
