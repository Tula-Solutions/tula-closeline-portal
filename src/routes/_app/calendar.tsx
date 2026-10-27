import { createFileRoute } from '@tanstack/react-router'
import { CalendarScreen } from '~/screens/calendar/CalendarScreen'

export const Route = createFileRoute('/_app/calendar')({
  component: () => <CalendarScreen />,
})
