import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { type FormEvent, useEffect, useState } from 'react'
import { AUTH_ERRORS, emailSchema } from 'tula-closeline-contract'
import { ApiError, CLIENT_ERRORS, clientError } from '~/api/errors'
import { type FieldName, present, presentGoogleError } from '~/api/messages'
import { useApp, useSessionState } from '~/app-context'
import { AuthTitle } from '~/components/app/auth-title'
import { SocialSignIn } from '~/components/app/social-sign-in'
import { googleErrorCode } from '~/data/google'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
import { SubmitButton } from '~/ui/SubmitButton'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'

const WRONG_CREDENTIALS = present(
  new ApiError({ code: AUTH_ERRORS['auth.invalid_credentials'].code, status: 401 }),
  'sign-in'
).message

type Errors = { fields: Partial<Record<FieldName, string>>; form?: string }

/** Sign-in with an email address and password: start the sign-in, then send the password. */
export function SignInScreen() {
  const app = useApp()
  const session = useSessionState()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Errors>({ fields: {} })
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  useDocumentTitle('Sign in')
  const search = useSearch({ from: '/_public/sign-in' })
  const navigate = useNavigate()
  // A failed Google sign-in comes back as `?error=<code>`: show it, then take it out of the address.
  const code = googleErrorCode(search.error)
  const [googleError] = useState(() => (code === undefined ? null : presentGoogleError(code)))
  // The failure message takes focus on arrival so a screen reader reads it first.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on arrival
  useEffect(() => {
    if (googleError !== null) {
      bannerRef.current?.focus()
    }
  }, [])
  const hasError = search.error !== undefined
  useEffect(() => {
    if (hasError) {
      void navigate({
        to: '/sign-in',
        search: (previous) =>
          previous.redirect === undefined ? {} : { redirect: previous.redirect },
        replace: true,
      })
    }
  }, [hasError, navigate])

  const signIn = useSubmit<void>(
    async () => {
      const started = await app.auth.startSignIn(emailSchema.parse(email.trim()))
      if (started.step.status !== 'needs_password' || !started.attemptSecret) {
        throw clientError(CLIENT_ERRORS.badResponse, 200)
      }
      const done = await app.auth.submitPassword(
        { id: started.id, secret: started.attemptSecret },
        password
      )
      if (done.step.status !== 'complete' || !done.session) {
        throw clientError(CLIENT_ERRORS.badResponse, 200)
      }
      app.session.start(done.session)
    },
    {
      onError(error) {
        const shown = present(error, 'sign-in')
        if (shown.field === 'email') {
          setErrors({ fields: { email: shown.message } })
        } else {
          // A password the service refuses on its rules is just "not right" here: never explain the rules.
          const text = shown.field ? WRONG_CREDENTIALS : shown.message
          setErrors({ fields: {}, form: text })
        }
        focusFirstError()
      },
    }
  )

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (signIn.pending) {
      return
    }
    const fields: Errors['fields'] = {}
    if (!emailSchema.safeParse(email.trim()).success) {
      fields.email = 'Enter a valid email address.'
    }
    if (password === '') {
      fields.password = 'Enter your password.'
    }
    if (Object.keys(fields).length > 0) {
      setErrors({ fields })
      focusFirstError()
      return
    }
    setErrors({ fields: {} })
    signIn.submit()
  }

  return (
    <>
      <AuthTitle description='Welcome back. Sign in to your Organization.'>Sign in</AuthTitle>
      <SocialSignIn
        intent='sign_in'
        {...(search.redirect === undefined ? {} : { returnTo: search.redirect })}
      />
      <form ref={formRef} onSubmit={onSubmit} noValidate>
        {(errors.form ?? googleError) ? (
          <Banner kind='error' innerRef={bannerRef}>
            {errors.form ?? googleError}
          </Banner>
        ) : session.status === 'signed_out' && session.ended ? (
          <Banner kind='info' innerRef={bannerRef}>
            Your session has ended. Sign in again.
          </Banner>
        ) : null}
        <Field
          label='Email address'
          name='email'
          type='email'
          autoComplete='username'
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.fields.email}
        />
        <Field
          label='Password'
          name='password'
          type='password'
          autoComplete='current-password'
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.fields.password}
        />
        <SubmitButton pending={signIn.pending} className='w-full' size='lg'>
          {signIn.pending ? 'Signing in...' : 'Sign in'}
        </SubmitButton>
      </form>
      <p className='mt-6 text-center text-sm text-muted-foreground'>
        New to Closeline?{' '}
        <Link
          to='/sign-up'
          className='font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-current'
        >
          Create an Organization
        </Link>
      </p>
    </>
  )
}
