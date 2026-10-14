import { Outlet } from '@tanstack/react-router'
import { PageHeader } from '~/components/app/page-header'
import { can } from '~/data/permissions'
import { useRole } from '~/data/session-role'
import { useDocumentTitle } from '~/ui/useDocumentTitle'

function Forbidden() {
  useDocumentTitle('Not allowed')
  return (
    <PageHeader
      title='Not allowed'
      description='Sales history is for Owners and Admins. Ask an Owner or Admin of your Organization.'
    />
  )
}

/**
 * The frame of the sales-history section. Only an Owner or Admin gets the pages (their menu is in
 * the sidebar); a Manager or Rep gets a notice and no page below runs, so nothing is requested for
 * them. The service refuses them as well: this only keeps the screens from showing what they
 * cannot use.
 */
export function SalesLayout() {
  const role = useRole()
  if (role === null) {
    return null
  }
  if (!can.manageSalesHistory(role)) {
    return <Forbidden />
  }
  return <Outlet />
}
