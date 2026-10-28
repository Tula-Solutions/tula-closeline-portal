import { createFileRoute } from '@tanstack/react-router'
import { ManageBookingPage } from '~/screens/booking/ManageBookingPage'

/** Reads the Booking's manage token from the address and hands it to the page. */
function ManageBookingRoute() {
  const { token } = Route.useParams()
  return <ManageBookingPage token={token} />
}

export const Route = createFileRoute('/book/manage/$token')({ component: ManageBookingRoute })
