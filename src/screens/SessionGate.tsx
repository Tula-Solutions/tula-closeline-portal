import type { ReactNode } from 'react'
import { useApp, useSessionState } from '~/app-context'
import { Button } from '~/components/ui/button'
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
      <main
        className='mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center [&_p]:m-0'
        id='main'
        aria-busy='true'
      >
        <Logo className='mb-4 w-40' />
        <p role='status'>Restoring your session…</p>
      </main>
    )
  }
  if (session.status === 'misconfigured') {
    // Auth refused the request for a reason a retry cannot change, such as an address it does not allow.
    return (
      <main
        className='mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center [&_p]:m-0'
        id='main'
      >
        <Logo className='mb-4 w-40' />
        <Banner kind='error'>
          This portal is not set up correctly for this address. Reload the page; if this stays,
          contact support.
        </Banner>
      </main>
    )
  }
  if (session.status === 'unreachable') {
    return (
      <main
        className='mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center [&_p]:m-0'
        id='main'
      >
        <Logo className='mb-4 w-40' />
        <Banner kind='error'>
          We could not reach the service, so we cannot tell whether you are signed in. Check your
          connection and try again.
        </Banner>
        <Button onClick={() => void app.session.restore()}>Try again</Button>
      </main>
    )
  }
  return <>{props.children}</>
}
