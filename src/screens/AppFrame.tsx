import { Navigate, useRouterState } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { useSessionState } from '~/app-context'

const Shell = lazy(() => import('~/screens/Shell').then((m) => ({ default: m.Shell })))
const MarketingLayout = lazy(() =>
  import('~/marketing/MarketingLayout').then((m) => ({ default: m.MarketingLayout }))
)
const MarketingHome = lazy(() =>
  import('~/marketing/MarketingHome').then((m) => ({ default: m.MarketingHome }))
)

/**
 * The frame of the `_app` routes. Everywhere but `/` it is the signed-in shell. At `/` a person who
 * is not signed in (a visitor, someone who signed out, or whose session could not be restored) sees
 * the marketing site instead; a signed-in person keeps Home inside the same shell, so going from
 * Home to another page does not rebuild it. A session that ended while the person was using the
 * app still goes to sign-in, where the notice that it ended is shown. Each side loads only when
 * it is needed.
 */
export function AppFrame() {
  const session = useSessionState()
  const atRoot = useRouterState({ select: (state) => state.location.pathname === '/' })
  if (atRoot && session.status !== 'signed_in') {
    if (session.status === 'signed_out' && session.ended) {
      return <Navigate to='/sign-in' replace />
    }
    return (
      <Suspense fallback={null}>
        <MarketingLayout>
          <MarketingHome />
        </MarketingLayout>
      </Suspense>
    )
  }
  return (
    <Suspense fallback={null}>
      <Shell />
    </Suspense>
  )
}
