import { createFileRoute } from '@tanstack/react-router'
import { UnsubscribePage } from '~/marketing/UnsubscribePage'

/** Reads the token from the address and hands it to the page. */
function UnsubscribeRoute() {
  const { token } = Route.useParams()
  return <UnsubscribePage token={token} />
}

export const Route = createFileRoute('/_site/unsubscribe/$token')({ component: UnsubscribeRoute })
