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
      description='Importing Prospects is for Owners and Admins. Ask an Owner or Admin of your Organization.'
    />
  )
}

/**
 * The frame of the Prospect import pages. Only an Owner or Admin gets them; a Manager or Rep gets
 * a notice and no page below runs, so nothing is requested for them (core refuses them as well).
 */
export function ProspectImportsLayout() {
  const role = useRole()
  if (role === null) {
    return null
  }
  if (!can.importProspects(role)) {
    return <Forbidden />
  }
  return <Outlet />
}
