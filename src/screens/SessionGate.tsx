import type { ReactNode } from 'react'
import { useApp, useSessionState } from '~/app-context'
import { Banner } from '~/ui/Banner'
import { Logo } from '~/ui/Logo'

/**
 * Holds the screens back until the refresh made on load has answered, so a signed-in person never
 * sees a sign-in screen flash. While it is in flight there is a pending screen; if auth could not
 * be reached there is a message with a retry (that is not "signed out"); if auth refused the
 * request outright there is a message with no retry.
 */
export function SessionGate(props: { readonly children: ReactNode }) {
  const app = useApp()
  const session = useSessionState()
  if (session.status === 'restoring') {
    return (
      <main className='page-centered' id='main' aria-busy='true'>
        <Logo />
        <p role='status'>Restoring your session…</p>
      </main>
    )
  }
  if (session.status === 'misconfigured') {
    // Auth refused the request for a reason a retry cannot change, such as an address it does not allow.
    return (
      <main className='page-centered' id='main'>
        <Logo />
        <Banner kind='error'>
          This portal is not set up correctly for this address. Contact support.
        </Banner>
      </main>
    )
  }
  if (session.status === 'unreachable') {
    return (
      <main className='page-centered' id='main'>
        <Logo />
        <Banner kind='error'>
          We could not reach the service, so we cannot tell whether you are signed in. Check your
          connection and try again.
        </Banner>
        <button type='button' className='button' onClick={() => void app.session.restore()}>
          Try again
        </button>
      </main>
    )
  }
  return <>{props.children}</>
}
