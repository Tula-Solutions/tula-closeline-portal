import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import {
  CONSENT_CHANNELS,
  type ConsentChannel,
  type HostedConsentReceipt,
  hostedConsentSubmissionSchema,
} from 'tula-closeline-contract'
import { presentHostedConsent } from '~/api/consent-messages'
import { fingerprint } from '~/api/idempotency'
import { useApp } from '~/app-context'
import { CHANNEL_NAME } from '~/data/consent'
import { CONSENT_FORM_PAGE } from '~/marketing/copy/consent-form'
import { usePageMeta } from '~/marketing/usePageMeta'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
import { SubmitButton } from '~/ui/SubmitButton'
import { Untrusted } from '~/ui/Untrusted'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'
import { When } from '~/ui/When'

const WIDTH = 'mx-auto max-w-[88rem] px-4 sm:px-8'
const LINK =
  'rounded-sm underline decoration-border-strong decoration-1 underline-offset-4 outline-hidden hover:decoration-current focus-visible:ring-2 focus-visible:ring-ring'
const HEADING = 'm-0 font-serif text-3xl tracking-[-0.02em] outline-hidden'

type Errors = { choices?: string; phone?: string; email?: string; name?: string; form?: string }

/** Which field a schema issue belongs to; anything else is shown on the form. */
function fieldOf(path: readonly PropertyKey[]): keyof Errors {
  const first = path[0]
  if (first === 'phone' || first === 'email') {
    return first
  }
  if (first === 'choices') {
    return 'choices'
  }
  return first === 'firstName' || first === 'lastName' ? 'name' : 'form'
}

/**
 * The public consent page, reached from a link an Organization shares: no sign-in. It shows who
 * is asking, the exact wording, and one unticked box per channel offered. The answer is sent with
 * an idempotency key, so a double click records once, and the receipt names channels and a time,
 * never an address. A bad, closed or changed link gets one calm message.
 */
export function ConsentFormPage(props: { readonly token: string }) {
  const app = useApp()
  const copy = CONSENT_FORM_PAGE
  usePageMeta(copy.meta)
  const { token } = props
  useEffect(() => {
    // The token is a secret in the address: no report may carry it.
    app.reporter.redact(token)
  }, [app, token])
  const view = useQuery({
    queryKey: ['hosted-consent', token],
    queryFn: ({ signal }) => app.hostedConsent.view(token, signal),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  })
  const [ticked, setTicked] = useState<readonly ConsentChannel[]>([])
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [receipt, setReceipt] = useState<HostedConsentReceipt | null>(null)
  const [refused, setRefused] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const send = useSubmit<ReturnType<typeof hostedConsentSubmissionSchema.parse>>(
    async (body) => {
      const attempt = app.keys.begin(fingerprint.hostedConsent(token, JSON.stringify(body)))
      try {
        const result = await app.hostedConsent.submit(token, body, attempt.key)
        attempt.succeeded()
        setReceipt(result)
      } catch (error) {
        attempt.failed(error)
        throw error
      }
    },
    {
      onError(error) {
        const failure = presentHostedConsent(error)
        if (failure.kind === 'gone') {
          setRefused(true)
          return
        }
        setErrors({ form: failure.message })
        focusFirstError()
      },
    }
  )
  const invalid = refused || (view.isError && presentHostedConsent(view.error).kind === 'gone')
  useEffect(() => {
    if (receipt || invalid) {
      headingRef.current?.focus()
    }
  }, [receipt, invalid])

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (send.pending || !view.data) {
      return
    }
    const trimmed = (value: string) => value.trim() || undefined
    const candidate = {
      wordingId: view.data.wordingId,
      firstName: trimmed(firstName),
      lastName: trimmed(lastName),
      email: trimmed(email),
      phone: trimmed(phone),
      choices: view.data.channels.map((channel) => ({ channel, agreed: ticked.includes(channel) })),
    }
    const parsed = hostedConsentSubmissionSchema.safeParse(candidate)
    if (!parsed.success) {
      const next: Errors = {}
      for (const issue of parsed.error.issues) {
        const field = fieldOf(issue.path)
        next[field] ??= field === 'form' ? copy.errors.generic : copy.errors[field]
      }
      setErrors(next)
      focusFirstError()
      return
    }
    setErrors({})
    send.submit(parsed.data)
  }

  let body: React.ReactNode
  if (receipt && view.data) {
    const agreed = receipt.channels.map((channel) => CHANNEL_NAME[channel]).join(', ')
    body = (
      <>
        <h2 ref={headingRef} tabIndex={-1} className={HEADING}>
          {copy.done.heading}
        </h2>
        <p role='status' className='m-0 mt-3 max-w-[48ch] leading-relaxed'>
          <Untrusted value={view.data.organizationName} /> {copy.done.textTail}
        </p>
        <p className='m-0 mt-3'>{agreed}</p>
        <p className='hint m-0 mt-1'>
          {copy.done.at} <When iso={receipt.recordedAt} />
        </p>
        <Link to='/' className={`mt-6 inline-block ${LINK}`}>
          {copy.done.homeLink}
        </Link>
      </>
    )
  } else if (invalid) {
    body = (
      <>
        <h2 ref={headingRef} tabIndex={-1} className={HEADING}>
          {copy.invalid.heading}
        </h2>
        <p className='m-0 mt-3 max-w-[48ch] leading-relaxed'>{copy.invalid.text}</p>
        <Link to='/' className={`mt-6 inline-block ${LINK}`}>
          {copy.done.homeLink}
        </Link>
      </>
    )
  } else if (view.isError) {
    body = (
      <>
        <Banner kind='error'>{copy.unreachable}</Banner>
        <button
          type='button'
          className={`bg-transparent p-0 ${LINK}`}
          onClick={() => void view.refetch()}
        >
          {copy.retry}
        </button>
      </>
    )
  } else if (view.data) {
    const offered = CONSENT_CHANNELS.filter(
      (channel) => channel !== 'linkedin' && view.data.channels.includes(channel)
    )
    body = (
      <form ref={formRef} onSubmit={onSubmit} noValidate aria-label={copy.label}>
        {errors.form ? (
          <Banner kind='error' innerRef={bannerRef}>
            {errors.form}
          </Banner>
        ) : null}
        <p className='m-0 max-w-[48ch] leading-relaxed'>
          <Untrusted value={view.data.organizationName} /> {copy.introTail}
        </p>
        <h2 className={`${HEADING} mt-8 text-xl`}>{copy.explainer.heading}</h2>
        <ul className='m-0 mt-3 max-w-[48ch] list-disc pl-5 leading-relaxed'>
          {copy.explainer.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <h2 className={`${HEADING} mt-8 text-xl`}>{copy.wordingHeading}</h2>
        <blockquote className='m-0 mt-3 max-w-[48ch] border-l-2 border-border-strong pl-4 leading-relaxed whitespace-pre-wrap break-words'>
          <bdi>{view.data.wordingText}</bdi>
        </blockquote>
        <fieldset
          className='mt-8 border-0 p-0'
          aria-describedby={errors.choices ? 'consent-choices-error' : undefined}
        >
          <legend className='label-mono mb-2'>{copy.channelsHeading}</legend>
          <p className='hint mt-0 mb-3'>{copy.channelsHint}</p>
          {offered.map((channel) => (
            <label key={channel} className='mb-2 flex items-center gap-2'>
              <input
                type='checkbox'
                name='channels'
                checked={ticked.includes(channel)}
                aria-invalid={errors.choices ? 'true' : undefined}
                onChange={(event) =>
                  setTicked((now) =>
                    event.target.checked ? [...now, channel] : now.filter((c) => c !== channel)
                  )
                }
              />
              {CHANNEL_NAME[channel]}
            </label>
          ))}
          {errors.choices ? (
            <p id='consent-choices-error' role='alert' className='text-sm text-danger'>
              <strong>{copy.errorLabel}</strong> {errors.choices}
            </p>
          ) : null}
        </fieldset>
        <h2 className={`${HEADING} mt-8 text-xl`}>{copy.contact.heading}</h2>
        <div className='mt-3 max-w-[28rem]'>
          <Field
            label={copy.contact.firstName}
            name='firstName'
            autoComplete='given-name'
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
          <Field
            label={copy.contact.lastName}
            name='lastName'
            autoComplete='family-name'
            error={errors.name}
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
          {offered.some((c) => c !== 'email') ? (
            <Field
              label={copy.contact.phone}
              hint={copy.contact.phoneHint}
              name='phone'
              type='tel'
              autoComplete='tel'
              error={errors.phone}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          ) : null}
          {offered.includes('email') ? (
            <Field
              label={copy.contact.email}
              hint={copy.contact.emailHint}
              name='email'
              type='email'
              autoComplete='email'
              error={errors.email}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          ) : null}
        </div>
        <SubmitButton pending={send.pending}>
          {send.pending ? copy.working : copy.button}
        </SubmitButton>
      </form>
    )
  } else {
    body = (
      <p role='status' className='m-0 leading-relaxed'>
        {copy.loading}
      </p>
    )
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
            {copy.label}
          </h1>
          <div className='mt-10 max-w-[36rem] border-t border-border-strong pt-6'>{body}</div>
        </div>
      </section>
    </div>
  )
}
