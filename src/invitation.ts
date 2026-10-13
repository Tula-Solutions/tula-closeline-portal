import { invitationTokenSchema } from 'tula-closeline-contract'

/** What the page's address carried: no Invitation, a well-formed token, or a token that cannot be one. */
export type InvitationState =
  | { readonly status: 'none' }
  | { readonly status: 'present'; readonly token: string }
  | { readonly status: 'malformed' }

/** Holds an Invitation token in memory after taking it out of the address bar. */
export type InvitationHolder = {
  /** Reads `#invitation=<token>` from the address and removes it at once; call before the router starts. */
  captureFromLocation(
    location: Pick<Location, 'hash' | 'pathname' | 'search'>,
    history: Pick<History, 'replaceState' | 'state'>
  ): void
  /** The captured state. */
  current(): InvitationState
  /** Gives the held token (if any) to a sink that must keep it out of reports; nothing else gets it from here. */
  revealTo(sink: (token: string) => void): void
  /** Forgets the Invitation (the person chose to create an Organization instead). */
  clear(): void
}

const PARAMETER = 'invitation'

/** Creates the holder. The token lives only here: never in storage, never in a URL, never in a report. */
export function createInvitationHolder(): InvitationHolder {
  let state: InvitationState = { status: 'none' }
  return {
    captureFromLocation(location, history) {
      const parameters = new URLSearchParams(location.hash.replace(/^#/, ''))
      if (!parameters.has(PARAMETER)) {
        return
      }
      const raw = parameters.get(PARAMETER) ?? ''
      parameters.delete(PARAMETER)
      const rest = parameters.toString()
      // A path that starts with two slashes would resolve as another origin and make replaceState
      // throw with the token still in the address bar.
      const path = location.pathname.replace(/^\/{2,}/, '/')
      history.replaceState(
        history.state,
        '',
        `${path}${location.search}${rest === '' ? '' : `#${rest}`}`
      )
      const parsed = invitationTokenSchema.safeParse(raw)
      state = parsed.success ? { status: 'present', token: parsed.data } : { status: 'malformed' }
    },
    current: () => state,
    revealTo(sink) {
      if (state.status === 'present') {
        sink(state.token)
      }
    },
    clear() {
      state = { status: 'none' }
    },
  }
}
