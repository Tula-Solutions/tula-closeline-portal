import { Link } from '@tanstack/react-router'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { createDemoRequestRequestSchema, ERRORS, MARKETING_ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { useApp } from '~/app-context'
import { DEMO_PAGE } from '~/marketing/copy/demo'
import { usePageMeta } from '~/marketing/usePageMeta'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
import { SubmitButton } from '~/ui/SubmitButton'
import { TextAreaField } from '~/ui/TextAreaField'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'

const WIDTH = 'mx-auto max-w-[88rem] px-4 sm:px-8'

type FieldName = 'name' | 'workEmail' | 'companyName' | 'message'
type Errors = { fields: Partial<Record<FieldName, string>>; form?: string }
type Values = { name: string; workEmail: string; companyName: string; message: string }

const FIELD_NAMES: readonly string[] = ['name', 'workEmail', 'companyName', 'message']

/** The words for a refused request, chosen by the contract's `area.reason` code and never the status. */
function refusal(error: unknown): { message: string; newKey: boolean } {
  const code = error instanceof ApiError ? error.code : ''
  const errors = DEMO_PAGE.errors
  if (code === MARKETING_ERRORS['marketing.invalid_request'].code) {
    return { message: errors.invalid, newKey: false }
  }
  if (code === ERRORS['request.too_large'].code) {
    return { message: errors.invalid, newKey: false }
  }
  if (code === MARKETING_ERRORS['marketing.rate_limited'].code) {
    return { message: errors.rateLimited, newKey: false }
  }
  if (code === ERRORS['request.idempotency_key_reused'].code) {
    return { message: errors.keyReused, newKey: true }
  }
  if (code === ERRORS['request.idempotency_in_progress'].code) {
    return { message: errors.inProgress, newKey: false }
  }
  return { message: errors.unreachable, newKey: false }
}

/**
 * The book-a-demo page: a form that posts a Demo Request to core. The contract's schema checks the
 * fields before anything is sent; the idempotency key is made once per page load and reused on every
 * retry of the same request (a changed request gets a new one, since core refuses a key reused for
 * a different body). The page promises no reply time.
 */
export function DemoPage() {
  const app = useApp()
  const copy = DEMO_PAGE
  usePageMeta(copy.meta)
  const [values, setValues] = useState<Values>({
    name: '',
    workEmail: '',
    companyName: '',
    message: '',
  })
  const [trap, setTrap] = useState('')
  const [errors, setErrors] = useState<Errors>({ fields: {} })
  const [done, setDone] = useState(false)
  const key = useRef(crypto.randomUUID())
  const sent = useRef<string | null>(null)
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const confirmationRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (done) {
      confirmationRef.current?.focus()
    }
  }, [done])

  const set = (field: keyof Values) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }))

  const send = useSubmit<ReturnType<typeof createDemoRequestRequestSchema.parse>>(
    async (body) => {
      const fingerprint = JSON.stringify(body)
      // Core refuses a key reused for a different body, so a changed request gets a new key.
      if (sent.current !== null && sent.current !== fingerprint) {
        key.current = crypto.randomUUID()
      }
      sent.current = fingerprint
      await app.marketing.createDemoRequest(body, key.current)
      setErrors({ fields: {} })
      setDone(true)
    },
    {
      onError(error) {
        const shown = refusal(error)
        if (shown.newKey) {
          key.current = crypto.randomUUID()
          sent.current = null
        }
        setErrors({ fields: {}, form: shown.message })
        focusFirstError()
      },
    }
  )

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (send.pending) {
      return
    }
    const message = values.message.trim()
    const parsed = createDemoRequestRequestSchema.safeParse({
      name: values.name,
      workEmail: values.workEmail,
      companyName: values.companyName,
      ...(message === '' ? {} : { message }),
      sourcePage: copy.path,
      website: trap,
    })
    if (!parsed.success) {
      const fields: Errors['fields'] = {}
      let form: string | undefined
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0])
        if (FIELD_NAMES.includes(field)) {
          fields[field as FieldName] ??= copy.fields[field as FieldName].error
        } else {
          form = copy.errors.invalid
        }
      }
      setErrors({ fields, ...(form === undefined ? {} : { form }) })
      focusFirstError()
      return
    }
    setErrors({ fields: {} })
    send.submit(parsed.data)
  }

  return (
    <div className={WIDTH}>
      <section aria-labelledby='headline' className='md:grid md:grid-cols-12'>
        <div className='pt-6 md:col-span-3 md:pr-6'>
          <p className='label-mono m-0 text-foreground'>{copy.label}</p>
        </div>
        <div className='pt-4 pb-10 md:col-span-9 md:border-l md:border-border-strong md:pt-6 md:pb-16 md:pl-8'>
          <h1
            id='headline'
            className='m-0 max-w-[16ch] font-serif text-[clamp(2.75rem,8vw,6.5rem)] leading-[0.95] font-normal tracking-[-0.04em] text-balance'
          >
            {copy.headline.before}
            <em className='font-normal italic'>{copy.headline.emphasis}</em>
            {copy.headline.after}
          </h1>
          <p className='m-0 mt-8 max-w-[56ch] text-xl leading-relaxed'>{copy.lede}</p>

          {done ? (
            <div className='mt-10 max-w-[36rem] border-t border-border-strong pt-6'>
              <h2
                ref={confirmationRef}
                tabIndex={-1}
                className='m-0 font-serif text-3xl tracking-[-0.02em] outline-hidden'
              >
                {copy.confirmation.heading}
              </h2>
              <p role='status' className='m-0 mt-3 max-w-[48ch] leading-relaxed'>
                {copy.confirmation.text}
              </p>
              <Link
                to='/'
                className='mt-6 inline-block rounded-sm underline decoration-border-strong decoration-1 underline-offset-4 outline-hidden hover:decoration-current focus-visible:ring-2 focus-visible:ring-ring'
              >
                {copy.confirmation.homeLink}
              </Link>
            </div>
          ) : (
            <form
              ref={formRef}
              noValidate
              aria-label={copy.formLabel}
              onSubmit={onSubmit}
              className='mt-10 max-w-[36rem] border-t border-border-strong pt-6'
            >
              {errors.form ? (
                <Banner kind='error' innerRef={bannerRef}>
                  {errors.form}
                </Banner>
              ) : null}
              <Field
                label={copy.fields.name.label}
                name='name'
                autoComplete='name'
                aria-required='true'
                value={values.name}
                onChange={(event) => set('name')(event.target.value)}
                error={errors.fields.name}
              />
              <Field
                label={copy.fields.workEmail.label}
                hint={copy.fields.workEmail.hint}
                name='workEmail'
                type='email'
                autoComplete='email'
                aria-required='true'
                value={values.workEmail}
                onChange={(event) => set('workEmail')(event.target.value)}
                error={errors.fields.workEmail}
              />
              <Field
                label={copy.fields.companyName.label}
                name='companyName'
                autoComplete='organization'
                aria-required='true'
                value={values.companyName}
                onChange={(event) => set('companyName')(event.target.value)}
                error={errors.fields.companyName}
              />
              <TextAreaField
                label={`${copy.fields.message.label} (${copy.optional})`}
                hint={copy.fields.message.hint}
                name='message'
                value={values.message}
                onChange={(event) => set('message')(event.target.value)}
                error={errors.fields.message}
              />
              {/* The honeypot: out of sight, out of the tab order and out of the accessibility tree. */}
              <div aria-hidden='true' className='absolute -left-[9999px] h-px w-px overflow-hidden'>
                <label>
                  {copy.fields.honeypot.label}
                  <input
                    type='text'
                    name='website'
                    tabIndex={-1}
                    autoComplete='off'
                    value={trap}
                    onChange={(event) => setTrap(event.target.value)}
                  />
                </label>
              </div>
              <SubmitButton pending={send.pending} className='mt-2'>
                {send.pending ? copy.sending : copy.submit}
              </SubmitButton>
              <p className='m-0 mt-4 max-w-[48ch] text-sm leading-relaxed text-muted-foreground'>
                {copy.privacy}
              </p>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}
