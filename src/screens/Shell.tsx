import { useQuery } from '@tanstack/react-query'
import { Navigate, Outlet } from '@tanstack/react-router'
import { useApp, useSessionState } from '~/app-context'
import type { Role } from '~/session/session'
import { Logo } from '~/ui/Logo'

const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  rep: 'Rep',
}

/** The authenticated frame: the logo, the Organization's name and the person's role, sign-out, and the page. */
export function Shell() {
  const app = useApp()
  const session = useSessionState()
  const organization = useQuery({
    queryKey: ['organization'],
    queryFn: ({ signal }) => app.core.getOrganization(signal),
    enabled: session.status === 'signed_in',
  })
  if (session.status === 'signed_out') {
    return <Navigate to='/sign-in' replace />
  }
  if (session.status !== 'signed_in') {
    // Restoring or unreachable: the session gate above shows the pending or retry screen.
    return null
  }
  return (
    <>
      <a className='skip-link' href='#main'>
        Skip to content
      </a>
      <header className='shell-header'>
        <Logo />
        <div className='shell-org'>
          {/* An Organization's name is untrusted text: <bdi> keeps a direction override from leaking out. */}
          <bdi className='org-name'>{organization.data?.name ?? 'Your Organization'}</bdi>
          <span className='role'>{ROLE_LABEL[session.organization.role]}</span>
        </div>
        <button type='button' className='button button-quiet' onClick={() => app.session.signOut()}>
          Sign out
        </button>
      </header>
      <main id='main' tabIndex={-1}>
        <Outlet />
      </main>
    </>
  )
}
