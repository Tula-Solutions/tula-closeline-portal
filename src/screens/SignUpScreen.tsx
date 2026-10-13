import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { emailSchema, organizationNameSchema } from 'tula-closeline-contract'
import { CLIENT_ERRORS, clientError } from '~/api/errors'
import { type FieldName, present } from '~/api/messages'
import { useApp } from '~/app-context'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'

type Errors = { fields: Partial<Record<FieldName, string>>; form?: string }
type Attempt = { id: string; secret: string; destination: string }

const CODE_PATTERN = /^\d{6}$/

/** Sign-up in two steps: the details (create an Organization, or accept an Invitation), then the emailed code. */
export function SignUpScreen() {
  const app = useApp()
  const [invitation, setInvitation] = useState(() => app.invitation.current())
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [code, setCode] = useState('')
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [errors, setErrors] = useState<Errors>({ fields: {} })
  const [notice, setNotice] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const step = attempt === null ? 'details' : 'code'
  useDocumentTitle(step === 'details' ? 'Sign up' : 'Enter your code')

  // Move focus to the new step's heading so a screen reader starts there.
  const previousStep = useRef(step)
  useEffect(() => {
    if (previousStep.current !== step) {
      previousStep.current = step
      headingRef.current?.focus()
    }
  }, [step])

  const policy = useQuery({
    queryKey: ['password-policy'],
    queryFn: ({ signal }) => app.auth.passwordPolicy(signal),
    staleTime: Number.POSITIVE_INFINITY,
  })

  const fail = (error: unknown) => {
    const shown = present(error, 'sign-up')
    // A refusal about the details (or an attempt that is gone) sends the person back to step one.
    if (shown.restart || shown.invitationRefused || (shown.field && shown.field !== 'code')) {
      setAttempt(null)
      setCode('')
    }
    if (shown.invitationRefused) {
      // Forget it everywhere, so leaving and coming back does not offer the same Invitation again.
      app.invitation.clear()
      setInvitation({ status: 'malformed' })
    }
    setErrors(
      shown.field
        ? { fields: { [shown.field]: shown.message } }
        : { fields: {}, form: shown.message }
    )
    focusFirstError()
  }

  const start = useSubmit<void>(
    async () => {
      const token = invitation.status === 'present' ? invitation.token : null
      const response = await app.auth.startSignUp({
        email: emailSchema.parse(email.trim()),
        password,
        ...(firstName.trim() ? { firstName: firstName.trim() } : {}),
        ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
        ...(token === null
          ? { organizationName: organizationNameSchema.parse(organizationName) }
          : { invitationToken: token }),
      })
      if (response.step.status !== 'needs_email_verification' || !response.attemptSecret) {
        throw clientError(CLIENT_ERRORS.badResponse, 200)
      }
      setAttempt({
        id: response.id,
        secret: response.attemptSecret,
        destination: response.step.destination ?? email.trim(),
      })
      setCode('')
      setNotice(null)
      setErrors({ fields: {} })
    },
    { onError: fail }
  )

  const verify = useSubmit<void>(
    async () => {
      if (attempt === null) {
        return
      }
      const response = await app.auth.verifySignUp(attempt, code.replace(/\s+/g, ''))
      if (response.step.status !== 'complete' || !response.session) {
        throw clientError(CLIENT_ERRORS.badResponse, 200)
      }
      app.session.start(response.session)
      app.invitation.clear()
    },
    { onError: fail }
  )

  const onDetails = (event: FormEvent) => {
    event.preventDefault()
    if (start.pending) {
      return
    }
    const fields: Errors['fields'] = {}
    if (!emailSchema.safeParse(email.trim()).success) {
      fields.email = 'Enter a valid email address.'
    }
    const length = [...password].length
    if (password === '') {
      fields.password = 'Enter a password.'
    } else if (policy.data && length < policy.data.minLength) {
      fields.password = 'The password is too short.'
    } else if (policy.data && length > policy.data.maxLength) {
      fields.password = 'The password is too long.'
    }
    if (
      invitation.status !== 'present' &&
      !organizationNameSchema.safeParse(organizationName).success
    ) {
      fields.organizationName = 'Enter a valid Organization name.'
    }
    if (Object.keys(fields).length > 0) {
      setErrors({ fields })
      focusFirstError()
      return
    }
    setErrors({ fields: {} })
    start.submit()
  }

  const onCode = (event: FormEvent) => {
    event.preventDefault()
    if (verify.pending) {
      return
    }
    if (!CODE_PATTERN.test(code.replace(/\s+/g, ''))) {
      setErrors({ fields: { code: 'Enter the 6-digit code from the email.' } })
      focusFirstError()
      return
    }
    setErrors({ fields: {} })
    verify.submit()
  }

  const resend = async () => {
    if (attempt === null || resending) {
      return
    }
    setResending(true)
    setNotice(null)
    setErrors({ fields: {} })
    try {
      await app.auth.resendSignUpCode(attempt)
      setNotice('We sent a new code. The old one no longer works.')
    } catch (error) {
      app.reporter.report(error)
      fail(error)
    } finally {
      setResending(false)
    }
  }

  const banner = errors.form ? (
    <Banner kind='error' innerRef={bannerRef}>
      {errors.form}
    </Banner>
  ) : null

  if (step === 'code' && attempt !== null) {
    return (
      <>
        <h1 tabIndex={-1} ref={headingRef}>
          Check your email
        </h1>
        <p>
          If this address can be used to sign up, we emailed a 6-digit code to{' '}
          <strong>{attempt.destination}</strong>. Enter it below. It works for 10 minutes.
        </p>
        <form ref={formRef} onSubmit={onCode} noValidate>
          {banner}
          {notice ? <Banner kind='info'>{notice}</Banner> : null}
          <Field
            label='Code'
            name='code'
            type='text'
            inputMode='numeric'
            autoComplete='one-time-code'
            value={code}
            onChange={(event) => setCode(event.target.value)}
            error={errors.fields.code}
          />
          <button type='submit' className='button' aria-disabled={verify.pending}>
            {verify.pending ? 'Checking...' : 'Continue'}
          </button>
        </form>
        <div className='actions'>
          <button type='button' className='link' onClick={resend} aria-disabled={resending}>
            Send a new code
          </button>
          <button
            type='button'
            className='link'
            onClick={() => {
              setAttempt(null)
              setErrors({ fields: {} })
              setNotice(null)
            }}
          >
            Use a different address
          </button>
        </div>
      </>
    )
  }

  const invited = invitation.status === 'present'
  const policyHint = policy.data
    ? `Use ${policy.data.minLength} to ${policy.data.maxLength} characters.`
    : undefined
  return (
    <>
      <h1 tabIndex={-1} ref={headingRef}>
        {invited ? 'Accept your Invitation' : 'Create your Organization'}
      </h1>
      <p>
        {invited
          ? 'You were invited to join an Organization on Closeline. Enter your details to accept.'
          : 'Sign up to set up your Organization on Closeline. You will be its Owner.'}
      </p>
      <form ref={formRef} onSubmit={onDetails} noValidate>
        {banner}
        {invitation.status === 'malformed' && !errors.form ? (
          <Banner kind='error' innerRef={bannerRef}>
            This Invitation is not valid. Ask an Admin to send a new one.
          </Banner>
        ) : null}
        <Field
          label='Email address'
          name='email'
          type='email'
          autoComplete='email'
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.fields.email}
        />
        <Field
          label='Password'
          name='password'
          type='password'
          autoComplete='new-password'
          hint={policyHint}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.fields.password}
        />
        {invited ? null : (
          <Field
            label='Organization name'
            name='organizationName'
            type='text'
            autoComplete='organization'
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            error={errors.fields.organizationName}
          />
        )}
        <Field
          label='First name (optional)'
          name='firstName'
          type='text'
          autoComplete='given-name'
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
        />
        <Field
          label='Last name (optional)'
          name='lastName'
          type='text'
          autoComplete='family-name'
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
        />
        <button type='submit' className='button' aria-disabled={start.pending}>
          {start.pending ? 'Sending a code...' : 'Email me a code'}
        </button>
      </form>
      <div className='actions'>
        {invited || invitation.status === 'malformed' ? (
          <button
            type='button'
            className='link'
            onClick={() => {
              app.invitation.clear()
              setInvitation({ status: 'none' })
              setErrors({ fields: {} })
            }}
          >
            Create an Organization instead
          </button>
        ) : null}
        <Link to='/sign-in'>Sign in instead</Link>
      </div>
    </>
  )
}
