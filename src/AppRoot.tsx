import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { useEffect } from 'react'
import type { App } from '~/app'
import { AppContext, useSessionState } from '~/app-context'
import { ErrorBoundary } from '~/ErrorBoundary'
import type { createAppRouter } from '~/router'
import { SessionGate } from '~/screens/SessionGate'
import { followSignIn } from '~/ui/theme'

/** Keeps the theme in step with the session: the system for a visitor, the Appearance choice after sign-in. */
function ThemeFollowsSession() {
  const { status } = useSessionState()
  useEffect(
    () => followSignIn(status === 'signed_in' || status === 'signed_out' ? status : 'unknown'),
    [status]
  )
  return null
}

/** The providers around the router; the whole UI renders inside it. */
export function AppRoot(props: {
  readonly app: App
  readonly router: ReturnType<typeof createAppRouter>
}) {
  return (
    <AppContext.Provider value={props.app}>
      <QueryClientProvider client={props.app.queryClient}>
        <ThemeFollowsSession />
        <ErrorBoundary>
          <SessionGate>
            <RouterProvider router={props.router} />
          </SessionGate>
        </ErrorBoundary>
      </QueryClientProvider>
    </AppContext.Provider>
  )
}
