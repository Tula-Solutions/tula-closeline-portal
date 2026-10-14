import type { GoogleIntent } from 'tula-closeline-contract'
import { GoogleButton, useGoogleEnabled } from '~/components/app/google-button'

/**
 * The "Continue with Google" button above an email form, with an "or" divider. It renders nothing
 * unless the auth service says Google sign-in is on (`GET /v1/client/auth-options`).
 */
export function SocialSignIn(props: {
  readonly intent: GoogleIntent
  readonly returnTo?: string
  /** Hides the button whatever the options say: an Invitation is held, and it would not survive the trip to Google. */
  readonly suppressed?: boolean
}) {
  const enabled = useGoogleEnabled(props.suppressed !== true)
  if (!enabled || props.suppressed === true) {
    return null
  }
  return (
    <div data-slot='social-sign-in' className='mb-6 flex flex-col gap-4'>
      <GoogleButton
        intent={props.intent}
        {...(props.returnTo === undefined ? {} : { returnTo: props.returnTo })}
      />
      <div
        className='flex items-center gap-3 text-xs text-muted-foreground uppercase'
        aria-hidden='true'
      >
        <span className='h-px flex-1 bg-border' />
        or
        <span className='h-px flex-1 bg-border' />
      </div>
    </div>
  )
}
