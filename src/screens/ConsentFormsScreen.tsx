import { type FormEvent, useState } from 'react'
import {
  CONSENT_CHANNELS,
  type ConsentChannel,
  type ConsentForm,
  type ConsentWording,
  createConsentFormRequestSchema,
  MAX_CONSENT_FORM_NAME_LENGTH,
} from 'tula-closeline-contract'
import { presentConsentForm } from '~/api/consent-messages'
import { fingerprint } from '~/api/idempotency'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { Section } from '~/components/app/section'
import { CHANNEL_NAME } from '~/data/consent'
import { can } from '~/data/permissions'
import { refresh, useConsentForms, useConsentWordings } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { Banner } from '~/ui/Banner'
import { Confirm } from '~/ui/Confirm'
import { Field } from '~/ui/Field'
import { Paged } from '~/ui/Paged'
import { SelectField } from '~/ui/SelectField'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useFeedback } from '~/ui/useFeedback'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'
import { When } from '~/ui/When'

/** Where the hosted page lives; the token in it always comes from core. */
const hostedLink = (token: string) =>
  `${window.location.origin}/consent/${encodeURIComponent(token)}`

const STATE_WORD = { draft: 'Draft', published: 'Published', closed: 'Closed' } as const

/**
 * Hosted consent forms (Owner, Admin): pick a Consent Wording and the channels to offer, preview
 * what a Prospect will see, publish for a link, close when done. Publishing locks the wording, so
 * the text a Prospect agreed to can never change under their consent. Anyone else gets a notice and
 * no request is made.
 */
export function ConsentFormsScreen() {
  useDocumentTitle('Consent forms')
  const role = useRole()
  const feedback = useFeedback()
  const manage = role !== null && can.manageConsentWording(role)
  const forms = useConsentForms(manage)
  const wordings = useConsentWordings(manage)
  if (role === null) {
    return null
  }
  const header = (
    <PageHeader
      eyebrow='Organization'
      title='Consent forms'
      description='A page a Prospect opens from a link to agree, channel by channel, to be contacted. Each agreement is recorded with the exact wording shown.'
    />
  )
  if (!manage) {
    return (
      <>
        {header}
        <p role='status' className='notice'>
          Only an Owner or Admin can build consent forms.
        </p>
      </>
    )
  }
  const byId = new Map(wordings.items.map((wording) => [wording.id, wording]))
  // shortcut: only loaded pages are checked for a superseding wording; core rejects a superseded
  // one on create, so upgrade to draining the pages if that error shows up in practice.
  const replaced = new Set(wordings.items.map((wording) => wording.supersedesId))
  const usable = wordings.items.filter((wording) => !replaced.has(wording.id))
  return (
    <>
      {header}
      <div className='grid items-start gap-12 lg:grid-cols-12'>
        <div className='flex flex-col gap-12 lg:sticky lg:top-8 lg:order-2 lg:col-span-5'>
          <Section
            id='new-form'
            title='Build a form'
            description='A draft has no link until you publish it.'
          >
            <FormBuilder
              wordings={usable}
              loading={!wordings.state.hasData}
              onDone={feedback.done}
              onFail={feedback.failed}
            />
          </Section>
        </div>
        <div className='flex min-w-0 flex-col gap-8 lg:order-1 lg:col-span-7'>
          <p role='status' className='notice'>
            {feedback.notice}
          </p>
          <h2 className='m-0 border-t border-rule-strong pt-4'>All forms</h2>
          <Paged
            noun='consent forms'
            emptyText='No consent forms yet.'
            emptyHint='Write a Consent Wording first, then build a form from it.'
            state={forms.state}
            present={presentConsentForm}
          >
            <ul
              className='m-0 list-none divide-y border-y p-0 motion-safe:animate-fade'
              aria-label='Consent forms'
            >
              {forms.items.map((form) => (
                <FormItem
                  key={form.id}
                  form={form}
                  wording={byId.get(form.wordingId)}
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

/** What a Prospect will see on the page: the exact wording and each channel as an unticked choice. */
function Preview(props: { readonly text: string; readonly channels: readonly ConsentChannel[] }) {
  return (
    <figure className='m-0 border-l-2 border-rule-strong pl-4' aria-label='Preview'>
      <figcaption className='label-mono'>What a Prospect sees</figcaption>
      <p className='mt-2 mb-0 whitespace-pre-wrap break-words'>
        <bdi>{props.text}</bdi>
      </p>
      <ul className='m-0 mt-3 list-none p-0'>
        {props.channels.map((channel) => (
          <li key={channel} className='hint'>
            [ ] {CHANNEL_NAME[channel]}, not agreed until they tick it
          </li>
        ))}
      </ul>
    </figure>
  )
}

type BuilderErrors = { wording?: string; name?: string; channels?: string; form?: string }

function FormBuilder(props: {
  readonly wordings: readonly ConsentWording[]
  readonly loading: boolean
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const app = useApp()
  const [wordingId, setWordingId] = useState('')
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<readonly ConsentChannel[] | null>(null)
  const [errors, setErrors] = useState<BuilderErrors>({})
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const wording = props.wordings.find((candidate) => candidate.id === wordingId)
  const offered = wording
    ? (picked ?? wording.channels).filter((c) => wording.channels.includes(c))
    : []
  const create = useSubmit<ReturnType<typeof createConsentFormRequestSchema.parse>>(
    async (body) => {
      const attempt = app.keys.begin(fingerprint.consentFormCreate(JSON.stringify(body)))
      try {
        await app.consentForms.create(body, attempt.key)
      } catch (error) {
        attempt.failed(error)
        throw error
      }
      attempt.succeeded()
      setName('')
      setPicked(null)
      setErrors({})
      await refresh(app, 'consent')
      props.onDone('Draft saved. Publish it to get a link.')
    },
    {
      onError(error) {
        props.onFail()
        setErrors({ form: presentConsentForm(error).message })
        focusFirstError()
      },
    }
  )
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (create.pending) {
      return
    }
    props.onFail()
    const parsed = createConsentFormRequestSchema.safeParse({ wordingId, name, channels: offered })
    const next: BuilderErrors = {}
    if (!wording) {
      next.wording = 'Choose the Consent Wording the form shows.'
    }
    if (name.trim() === '') {
      next.name = 'Name the form, so you can tell it apart.'
    } else if (name.length > MAX_CONSENT_FORM_NAME_LENGTH) {
      next.name = `Keep the name to ${MAX_CONSENT_FORM_NAME_LENGTH} characters.`
    }
    if (offered.length === 0 && wording) {
      next.channels = 'Offer at least one channel.'
    }
    if (!parsed.success || Object.keys(next).length > 0) {
      setErrors(next)
      focusFirstError()
      return
    }
    setErrors({})
    create.submit(parsed.data)
  }
  const toggle = (channel: ConsentChannel, on: boolean) =>
    setPicked(CONSENT_CHANNELS.filter((c) => (c === channel ? on : offered.includes(c))))
  if (!props.loading && props.wordings.length === 0) {
    return <p className='hint m-0'>There is no Consent Wording to build a form from yet.</p>
  }
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className='max-w-none gap-0'>
      {errors.form ? (
        <Banner kind='error' innerRef={bannerRef}>
          {errors.form}
        </Banner>
      ) : null}
      <SelectField
        label='Consent Wording'
        name='wording'
        placeholder='Choose a wording'
        value={wordingId}
        error={errors.wording}
        options={props.wordings.map((candidate) => ({
          value: candidate.id,
          text: `Version ${candidate.version}: ${candidate.text.slice(0, 40)}`,
        }))}
        onChange={(event) => {
          setWordingId(event.target.value)
          setPicked(null)
        }}
      />
      <Field
        label='Form name'
        name='name'
        autoComplete='off'
        hint='For your own list. A Prospect does not see it.'
        value={name}
        error={errors.name}
        onChange={(event) => setName(event.target.value)}
      />
      {wording ? (
        <>
          <fieldset className='field mb-4 border-0 p-0'>
            <legend className='mb-2 text-sm font-medium'>Channels the form offers</legend>
            {wording.channels.map((channel) => (
              <label key={channel} className='mb-1 flex items-center'>
                <input
                  type='checkbox'
                  name='channels'
                  checked={offered.includes(channel)}
                  onChange={(event) => toggle(channel, event.target.checked)}
                />
                {CHANNEL_NAME[channel]}
              </label>
            ))}
            {errors.channels ? (
              <p className='field-error'>
                <strong>Error:</strong> {errors.channels}
              </p>
            ) : null}
          </fieldset>
          <p className='hint mt-0 mb-4'>
            {wording.locked
              ? 'This wording is already in use as evidence, so it cannot change.'
              : 'Nothing has used this wording yet. Publishing a form locks it: to change the text after that, write a new version.'}
          </p>
          <Preview text={wording.text} channels={offered} />
        </>
      ) : null}
      <div className='row-actions mt-4'>
        <button type='submit' className='button' aria-disabled={create.pending}>
          {create.pending ? 'Saving...' : 'Save draft'}
        </button>
      </div>
    </form>
  )
}

function FormItem(props: {
  readonly form: ConsentForm
  readonly wording: ConsentWording | undefined
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const { form, wording } = props
  const app = useApp()
  const [previewing, setPreviewing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fallback, setFallback] = useState<string | null>(null)
  const useChange = (action: 'publish' | 'close', done: string) =>
    useSubmit<void>(
      async () => {
        setError(null)
        setFallback(null)
        await app.consentForms[action](form.id)
        await refresh(app, 'consent')
        props.onDone(done)
      },
      {
        onError(failure) {
          props.onFail()
          setError(presentConsentForm(failure).message)
        },
      }
    )
  const publish = useChange('publish', 'Form published. Copy its link to share it.')
  const close = useChange('close', 'Form closed. Its link no longer works.')
  const copy = () => {
    if (form.token === null) {
      return
    }
    const link = hostedLink(form.token)
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
  const label = form.name.replace(/\s+/g, ' ').trim() || 'this form'
  return (
    <li className='py-4'>
      <div className='list-item-head'>
        <div className='flex min-w-0 flex-col'>
          <h3 className='item-title m-0 font-serif text-xl font-normal tracking-[-0.01em]'>
            <Untrusted value={form.name} />
          </h3>
          <span className='label-mono mt-1 block'>
            {STATE_WORD[form.state]} · {form.channels.map((c) => CHANNEL_NAME[c]).join(', ')}
          </span>
          <span className='hint'>
            {wording
              ? `Wording version ${wording.version}, ${wording.locked ? 'locked' : 'can still be edited'}`
              : 'Wording not loaded'}
            {' · '}
            {form.publishedAt ? (
              <>
                Published <When iso={form.publishedAt} />
              </>
            ) : (
              <>
                Saved <When iso={form.createdAt} />
              </>
            )}
            {form.closedAt ? (
              <>
                {' · Closed '}
                <When iso={form.closedAt} />
              </>
            ) : null}
          </span>
        </div>
        <div className='row-actions'>
          {wording ? (
            <button
              type='button'
              className='button button-quiet'
              aria-label={`Preview ${label}`}
              aria-expanded={previewing}
              onClick={() => setPreviewing((open) => !open)}
            >
              Preview
            </button>
          ) : null}
          {form.state === 'published' && form.token !== null ? (
            <button
              type='button'
              className='button button-quiet'
              aria-label={`Copy link for ${label}`}
              onClick={copy}
            >
              Copy link
            </button>
          ) : null}
          {form.state === 'draft' ? (
            <Confirm
              label='Publish'
              accessibleName={`Publish ${label}`}
              pendingAccessibleName={`Publishing ${label}`}
              pendingLabel='Publishing...'
              question={
                <>
                  Publish this form? It gets a public link, and its wording
                  {wording ? ` (version ${wording.version})` : ''} is locked from then on.
                </>
              }
              confirmLabel='Publish form'
              pending={publish.pending}
              onConfirm={() => publish.submit()}
            />
          ) : null}
          {form.state === 'published' ? (
            <Confirm
              label='Close'
              accessibleName={`Close ${label}`}
              pendingAccessibleName={`Closing ${label}`}
              pendingLabel='Closing...'
              question='Close this form? Its link stops working. The consent already recorded stays.'
              tone='quiet-destructive'
              confirmLabel='Close form'
              pending={close.pending}
              onConfirm={() => close.submit()}
            />
          ) : null}
        </div>
      </div>
      {error ? (
        <p role='alert' className='field-error mt-2'>
          {error}
        </p>
      ) : null}
      {fallback && form.state === 'published' ? (
        <input readOnly aria-label={`Link for ${label}`} value={fallback} className='mt-2 w-full' />
      ) : null}
      {previewing && wording ? (
        <div className='mt-4'>
          <Preview text={wording.text} channels={form.channels} />
        </div>
      ) : null}
    </li>
  )
}
