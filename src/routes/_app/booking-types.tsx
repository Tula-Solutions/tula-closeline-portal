import { createFileRoute } from '@tanstack/react-router'
import { BookingTypesScreen } from '~/screens/booking/BookingTypesScreen'

export const Route = createFileRoute('/_app/booking-types')({ component: BookingTypesScreen })
