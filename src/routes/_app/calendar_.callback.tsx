import { createFileRoute } from '@tanstack/react-router'
import { type CalendarReturn, CalendarScreen } from '~/screens/calendar/CalendarScreen'

const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined)

export const Route = createFileRoute('/_app/calendar_/callback')({
  // Google returns a one-time code and the `state`; the screen takes them out of the address at once.
  validateSearch: (search: Record<string, unknown>): CalendarReturn => ({
    code: text(search.code),
    state: text(search.state),
    error: text(search.error),
  }),
  component: function CalendarCallbackRoute() {
    return <CalendarScreen returned={Route.useSearch()} />
  },
})
