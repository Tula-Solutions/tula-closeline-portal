import { createFileRoute } from '@tanstack/react-router'
import { BookingsScreen } from '~/screens/booking/BookingsScreen'

export const Route = createFileRoute('/_app/bookings')({ component: BookingsScreen })
