import { Link } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { emailSchema } from 'tula-closeline-contract'
import { ApiError, CLIENT_ERRORS, clientError } from '~/api/errors'
import { type FieldName, present } from '~/api/messages'
import { useApp, useSessionState } from '~/app-context'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'

const WRONG_CREDENTIALS = present(
  new ApiError({ code: 'auth.invalid_credentials', status: 401 }),
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
      <h1>Sign in</h1>
      <form ref={formRef} onSubmit={onSubmit} noValidate>
        {errors.form ? (
          <Banner kind='error' innerRef={bannerRef}>
            {errors.form}
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
        <button type='submit' className='button' aria-disabled={signIn.pending}>
          {signIn.pending ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
      <div className='actions'>
        <Link to='/sign-up'>Create an Organization</Link>
      </div>
    </>
  )
}
