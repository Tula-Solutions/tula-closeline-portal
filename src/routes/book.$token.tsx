import { createFileRoute } from '@tanstack/react-router'
import { PublicBookingPage } from '~/screens/booking/PublicBookingPage'

/** Reads the Booking Type's secret token from the address and hands it to the page. */
function PublicBookingRoute() {
  const { token } = Route.useParams()
  return <PublicBookingPage token={token} />
}

export const Route = createFileRoute('/book/$token')({ component: PublicBookingRoute })
