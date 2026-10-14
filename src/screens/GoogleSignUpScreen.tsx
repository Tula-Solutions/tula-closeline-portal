import { Link } from '@tanstack/react-router'
import { type FormEvent, useRef, useState } from 'react'
import { organizationNameSchema } from 'tula-closeline-contract'
import { CLIENT_ERRORS, clientError } from '~/api/errors'
import { present } from '~/api/messages'
import { useApp } from '~/app-context'
import { AuthTitle } from '~/components/app/auth-title'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
import { SubmitButton } from '~/ui/SubmitButton'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'

const START_AGAIN = (
  <Link to='/sign-up' className='font-semibold text-primary underline-offset-4 hover:underline'>
    Start again
  </Link>
)

/**
 * The step after Google has vouched for a new person: name an Organization, or accept the
 * Invitation they came with, then finish. It completes exactly like the password sign-up (the same
 * session start); the attempt secret is a cookie only auth reads, and the address carries only the
 * attempt id.
 */
export function GoogleSignUpScreen(props: { readonly attempt: string | undefined }) {
  const app = useApp()
  const [invitation, setInvitation] = useState(() => app.invitation.current())
  const [organizationName, setOrganizationName] = useState('')
  const [fieldError, setFieldError] = useState<string | undefined>(undefined)
  const [formError, setFormError] = useState<string | null>(null)
  const [again, setAgain] = useState(false)
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const headingRef = useRef<HTMLHeadingElement>(null)
  useDocumentTitle('Finish signing up')

  const complete = useSubmit<void>(
    async () => {
      if (props.attempt === undefined) {
        return
      }
      const response = await app.auth.completeGoogle({
        attemptId: props.attempt,
        ...(invitation.status === 'present'
          ? { invitationToken: invitation.token }
          : { organizationName: organizationNameSchema.parse(organizationName) }),
      })
      if (response.step.status !== 'complete' || !response.session) {
        throw clientError(CLIENT_ERRORS.badResponse, 200)
      }
      app.session.start(response.session)
      app.invitation.clear()
    },
    {
      onError(error) {
        const shown = present(error, 'sign-up')
        if (shown.invitationRefused) {
          app.invitation.clear()
          setInvitation({ status: 'malformed' })
        }
        setAgain(shown.restart === true || shown.invitationRefused === true)
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
    if (
      invitation.status !== 'present' &&
      !organizationNameSchema.safeParse(organizationName).success
    ) {
      setFieldError('Enter a valid Organization name.')
      setFormError(null)
      focusFirstError()
      return
    }
    setFieldError(undefined)
    setFormError(null)
    complete.submit()
  }

  const invited = invitation.status === 'present'
  return (
    <>
      <AuthTitle
        focusable
        headingRef={headingRef}
        description={
          invited
            ? 'Google confirmed your email address. Accept the Invitation to join the Organization that invited you.'
            : 'Google confirmed your email address. Name your Organization to finish. You will be its Owner.'
        }
      >
        {invited ? 'Accept your Invitation' : 'Finish signing up'}
      </AuthTitle>
      <form ref={formRef} onSubmit={onSubmit} noValidate>
        {formError ? (
          <Banner kind='error' innerRef={bannerRef}>
            {formError}
          </Banner>
        ) : null}
        {invited ? null : (
          <Field
            label='Organization name'
            name='organizationName'
            autoComplete='organization'
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            error={fieldError}
          />
        )}
        <SubmitButton pending={complete.pending} className='w-full' size='lg'>
          {invited
            ? complete.pending
              ? 'Accepting...'
              : 'Accept Invitation'
            : complete.pending
              ? 'Creating...'
              : 'Create Organization'}
        </SubmitButton>
      </form>
      {again ? <p className='mt-6 text-center text-sm'>{START_AGAIN}</p> : null}
    </>
  )
}
