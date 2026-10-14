import { Link, Outlet } from '@tanstack/react-router'
import { can } from '~/data/permissions'
import { useRole } from '~/data/session-role'

/** The frame of the Playbook section: the menu between its Documents and Document search, then the page. */
export function PlaybookLayout() {
  const role = useRole()
  if (role === null) {
    return null
  }
  return (
    <>
      <nav className='main-nav sub-nav' aria-label='Playbook'>
        <Link to='/playbook' activeOptions={{ exact: true }}>
          Documents
        </Link>
        {can.searchDocuments(role) ? <Link to='/playbook/search'>Search</Link> : null}
      </nav>
      <Outlet />
    </>
  )
}
