import type { ReactNode } from 'react'

/**
 * Google sign-in is being built separately. Until it lands this is off and renders nothing, so
 * the forms are exactly as they were. To turn it on: set `GOOGLE_SIGN_IN_ENABLED` to true and
 * pass the "Continue with Google" button as `children` where `<SocialSignIn>` is used in
 * SignInScreen and SignUpScreen; it then shows above the form with an "or" divider.
 */
export const GOOGLE_SIGN_IN_ENABLED = false

/** The slot above the email forms for "Continue with Google" (hidden for now), with its "or" divider. */
export function SocialSignIn(props: { readonly children?: ReactNode }) {
  if (!GOOGLE_SIGN_IN_ENABLED || props.children === undefined) {
    return null
  }
  return (
    <div data-slot='social-sign-in' className='mb-6 flex flex-col gap-4'>
      {props.children}
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
