import type { Role } from 'tula-closeline-contract'
import { useSessionState } from '~/app-context'

/** The signed-in member's role, or null while there is no session (the shell shows nothing then). */
export function useRole(): Role | null {
  const session = useSessionState()
  return session.status === 'signed_in' ? session.organization.role : null
}
