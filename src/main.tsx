import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod'
import { AppRoot } from '~/AppRoot'
import { boot } from '~/boot'
import { EnvError } from '~/env'
import { createAppRouter } from '~/router'
import { createBroadcastSessionChannel } from '~/session/session'
import '~/styles.css'

// The Content-Security-Policy forbids eval, so Zod must not try to compile its validators.
z.config({ jitless: true })

const root = document.getElementById('root')
if (!root) {
  throw new Error('index.html has no #root element')
}

try {
  // Takes any Invitation token out of the address bar first, before anything can fail or report.
  const app = boot({
    raw: import.meta.env,
    location: window.location,
    history: window.history,
    channel: createBroadcastSessionChannel(),
  })
  // Restore the session before the first render: the state is `restoring` from the start, so no
  // sign-in screen flashes while the refresh is in flight.
  void app.session.restore()
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
