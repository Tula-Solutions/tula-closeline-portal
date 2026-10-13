import { createContext, useContext, useSyncExternalStore } from 'react'
import type { App } from '~/app'
import type { SessionSnapshot } from '~/session/session'

/** Carries the app to every screen. */
export const AppContext = createContext<App | null>(null)

/** Returns the app; throws if a screen is rendered outside the provider. */
export function useApp(): App {
  const app = useContext(AppContext)
  if (app === null) {
    throw new Error('useApp must be used inside <AppContext>')
  }
  return app
}

/** Returns the session's state and re-renders when it changes. */
export function useSessionState(): SessionSnapshot {
  const { session } = useApp()
  return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
}
