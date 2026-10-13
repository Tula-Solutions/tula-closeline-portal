import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod'
import { AppRoot } from '~/AppRoot'
import { createApp } from '~/app'
import { EnvError, parseEnv } from '~/env'
import { startReporting } from '~/report/reporter'
import { createAppRouter } from '~/router'
import '~/styles.css'

// The Content-Security-Policy forbids eval, so Zod must not try to compile its validators.
z.config({ jitless: true })

const root = document.getElementById('root')
if (!root) {
  throw new Error('index.html has no #root element')
}

try {
  const env = parseEnv(import.meta.env)
  const reporter = startReporting(env)
  const app = createApp({ env, reporter })
  // Take any Invitation token out of the address bar before the router reads the address.
  app.invitation.captureFromLocation(window.location, window.history)
  createRoot(root).render(
    <StrictMode>
      <AppRoot app={app} router={createAppRouter(app)} />
    </StrictMode>
  )
} catch (error) {
  // Misconfiguration stops the app at boot with a message naming each bad variable.
  const message = error instanceof EnvError ? error.message : 'The app could not start.'
  const pre = document.createElement('pre')
  pre.className = 'boot-error'
  pre.textContent = message
  root.replaceChildren(pre)
  throw error
}
