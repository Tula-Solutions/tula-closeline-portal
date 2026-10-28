import { createFileRoute } from '@tanstack/react-router'
import { ConsentFormPage } from '~/marketing/ConsentFormPage'

/** Reads the token from the address and hands it to the page. */
function ConsentFormRoute() {
  const { token } = Route.useParams()
  return <ConsentFormPage token={token} />
}

export const Route = createFileRoute('/_site/consent/$token')({ component: ConsentFormRoute })
