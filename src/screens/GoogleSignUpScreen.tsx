import { Link } from '@tanstack/react-router'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { organizationNameSchema } from 'tula-closeline-contract'
import { ApiError, CLIENT_ERRORS, clientError } from '~/api/errors'
import { present } from '~/api/messages'
import { useApp } from '~/app-context'
import { AuthTitle } from '~/components/app/auth-title'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
import { SubmitButton } from '~/ui/SubmitButton'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'

const LINK_CLASS = 'font-semibold text-primary underline-offset-4 hover:underline'

const START_AGAIN = (
  <Link to='/sign-up' className={LINK_CLASS}>
    Start again
  </Link>
)

/** After a failed finish the account may already exist (the call can succeed and its answer be lost), so signing in is offered too. */
const SIGN_IN_INSTEAD = (
  <Link to='/sign-in' className={LINK_CLASS}>
    Sign in with Google
  </Link>
)

/**
 * The step after Google has vouched for a new person: name an Organization, then finish. It
 * completes exactly like the password sign-up (the same session start); the attempt secret is a
 * cookie only auth reads, and the address carries only the attempt id. An Invitation is not
 * handled here: it lives in memory and would not survive the trip to Google, so the sign-up screen
 * hides the Google button while one is held and invited people use the email form.
 */
export function GoogleSignUpScreen(props: { readonly attempt: string | undefined }) {
  const app = useApp()
  const [organizationName, setOrganizationName] = useState('')
  const [fieldError, setFieldError] = useState<string | undefined>(undefined)
  const [formError, setFormError] = useState<string | null>(null)
  const [again, setAgain] = useState(false)
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const headingRef = useRef<HTMLHeadingElement>(null)
  useDocumentTitle('Finish signing up')
  // The step's heading takes focus on arrival, so a screen reader starts there.
  useEffect(() => headingRef.current?.focus(), [])

  const complete = useSubmit<void>(
    async () => {
      if (props.attempt === undefined) {
        return
      }
      const response = await app.auth.completeGoogle({
        attemptId: props.attempt,
        organizationName: organizationNameSchema.parse(organizationName),
      })
      if (response.step.status !== 'complete' || !response.session) {
        throw clientError(CLIENT_ERRORS.badResponse, 200)
      }
      app.session.start(response.session)
    },
    {
      onError(error) {
        const shown = present(error, 'sign-up')
        // The attempt is gone, or the answer was lost: the account may exist already.
        setAgain(
          shown.restart === true ||
            (error instanceof ApiError &&
              (error.code === CLIENT_ERRORS.network || error.code === CLIENT_ERRORS.timeout))
        )
        if (shown.field === 'organizationName') {
          setFieldError(shown.message)
          setFormError(null)
        } else {
          setFieldError(undefined)
          setFormError(shown.message)
        }
        focusFirstError()
      },
    }
  )

  if (props.attempt === undefined) {
    return (
      <>
        <AuthTitle focusable headingRef={headingRef}>
          Finish signing up
        </AuthTitle>
        <Banner kind='error'>
          This Google sign-in cannot continue. The link is missing its details or has expired.
        </Banner>
        <p className='mt-6 text-center text-sm'>{START_AGAIN}</p>
      </>
    )
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (complete.pending) {
      return
    }
    if (!organizationNameSchema.safeParse(organizationName).success) {
      setFieldError('Enter a valid Organization name.')
      setFormError(null)
      focusFirstError()
      return
    }
    setFieldError(undefined)
    setFormError(null)
    complete.submit()
  }

  return (
    <>
      <AuthTitle
        focusable
        headingRef={headingRef}
        description='Google confirmed your email address. Name your Organization to finish. You will be its Owner.'
      >
        Finish signing up
      </AuthTitle>
      <form ref={formRef} onSubmit={onSubmit} noValidate>
        {formError ? (
          <Banner kind='error' innerRef={bannerRef}>
            {formError}
          </Banner>
        ) : null}
        <Field
          label='Organization name'
          name='organizationName'
          autoComplete='organization'
          value={organizationName}
          onChange={(event) => setOrganizationName(event.target.value)}
          error={fieldError}
        />
        <SubmitButton pending={complete.pending} className='w-full' size='lg'>
          {complete.pending ? 'Creating...' : 'Create Organization'}
        </SubmitButton>
      </form>
      {again ? (
        <p className='mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-center text-sm'>
          {SIGN_IN_INSTEAD}
          {START_AGAIN}
        </p>
      ) : null}
    </>
  )
}
