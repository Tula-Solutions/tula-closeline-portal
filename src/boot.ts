import { type App, type AppInit, createApp as realCreateApp } from '~/app'
import { type Env, parseEnv } from '~/env'
import { createInvitationHolder } from '~/invitation'
import { type Reporter, startReporting as realStartReporting } from '~/report/reporter'
import type { SessionChannel } from '~/session/session'

/** What `boot` reads and may be given instead in tests. */
export type BootDeps = {
  /** The raw `VITE_*` variables. */
  readonly raw: Readonly<Record<string, unknown>>
  readonly location: Pick<Location, 'hash' | 'pathname' | 'search'>
  readonly history: Pick<History, 'replaceState' | 'state'>
  readonly startReporting?: (env: Env) => Reporter
  readonly createApp?: (init: AppInit) => App
  /** The line to the other tabs. */
  readonly channel?: SessionChannel | null
}

/**
 * Starts the portal's logic in the one safe order: the Invitation leaves the address bar first,
 * then the configuration is read, reporting starts and the app is built. Whatever fails later,
 * the token is no longer in the URL.
 */
export function boot(deps: BootDeps): App {
  const invitation = createInvitationHolder()
  invitation.captureFromLocation(deps.location, deps.history)
  const env = parseEnv(deps.raw)
  const reporter = (deps.startReporting ?? realStartReporting)(env)
  // The reporter strips the token by exact value from anything it sends.
  invitation.revealTo((token) => reporter.redact(token))
  return (deps.createApp ?? realCreateApp)({
    env,
    reporter,
    invitation,
    ...(deps.channel ? { channel: deps.channel } : {}),
  })
}
