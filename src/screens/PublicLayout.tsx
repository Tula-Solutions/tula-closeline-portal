import { Outlet, useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useSessionState } from '~/app-context'
import { parseReturnPath } from '~/data/return-path'
import { Logo } from '~/ui/Logo'

/**
 * The frame around sign-in and sign-up: the logo above a single column. A signed-in person is sent
 * to the home route from here, so a sign-in that finishes while its screen is gone still lands.
 */
export function PublicLayout() {
  const session = useSessionState()
  const navigate = useNavigate()
  const router = useRouter()
  const signedIn = session.status === 'signed_in'
  const back = parseReturnPath(
    new URLSearchParams(useRouterState({ select: (state) => state.location.searchStr })).get(
      'redirect'
    )
  )
  // Once: the address changes under this layout as it leaves, and it must not send the person on again.
  const sent = useRef(false)
  useEffect(() => {
    if (signedIn && !sent.current) {
      sent.current = true
      if (back === undefined) {
        void navigate({ to: '/', replace: true })
      } else {
        // `back` passed parseReturnPath: a relative address of this portal, so the router can take it as it is.
        router.history.replace(back)
      }
    }
  }, [signedIn, navigate, back, router])
  return (
    <main className='public' id='main'>
      <Logo />
      <div className='card'>
        <Outlet />
      </div>
    </main>
  )
}
