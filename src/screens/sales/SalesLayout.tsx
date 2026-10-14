import { Link, Outlet } from '@tanstack/react-router'
import { can } from '~/data/permissions'
import { useRole } from '~/data/session-role'
import { useDocumentTitle } from '~/ui/useDocumentTitle'

function Forbidden() {
  useDocumentTitle('Not allowed')
  return (
    <>
      <h1>Not allowed</h1>
      <p>Sales history is for Owners and Admins. Ask an Owner or Admin of your Organization.</p>
    </>
  )
}

/**
 * The frame of the sales-history section. Only an Owner or Admin gets the menu and the pages; a
 * Manager or Rep gets a notice and no page below runs, so nothing is requested for them. The
 * service refuses them as well: this only keeps the screens from showing what they cannot use.
 */
export function SalesLayout() {
  const role = useRole()
  if (role === null) {
    return null
  }
  if (!can.manageSalesHistory(role)) {
    return <Forbidden />
  }
  return (
    <>
      <nav className='main-nav sub-nav' aria-label='Sales history'>
        <Link to='/sales-history' activeOptions={{ exact: true }}>
          Overview
        </Link>
        <Link to='/sales-history/deals'>Deals</Link>
        <Link to='/sales-history/imports'>Imports</Link>
        <Link to='/sales-history/rights'>Rights confirmation</Link>
      </nav>
      <Outlet />
    </>
  )
}
