import { Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useSessionState } from '~/app-context'
import { Logo } from '~/ui/Logo'

/**
 * The frame around sign-in and sign-up: the logo above a single column. A signed-in person is sent
 * to the home route from here, so a sign-in that finishes while its screen is gone still lands.
 */
export function PublicLayout() {
  const session = useSessionState()
  const navigate = useNavigate()
  const signedIn = session.status === 'signed_in'
  useEffect(() => {
    if (signedIn) {
      void navigate({ to: '/', replace: true })
    }
  }, [signedIn, navigate])
  return (
    <main className='public' id='main'>
      <Logo />
      <div className='card'>
        <Outlet />
      </div>
    </main>
  )
}
