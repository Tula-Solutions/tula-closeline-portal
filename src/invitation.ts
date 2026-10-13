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
      history.replaceState(
        history.state,
        '',
        `${location.pathname}${location.search}${rest === '' ? '' : `#${rest}`}`
      )
      const parsed = invitationTokenSchema.safeParse(raw)
      state = parsed.success ? { status: 'present', token: parsed.data } : { status: 'malformed' }
    },
    current: () => state,
    clear() {
      state = { status: 'none' }
    },
  }
}
