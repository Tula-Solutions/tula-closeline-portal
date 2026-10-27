import { createFileRoute } from '@tanstack/react-router'
import { RepsScreen } from '~/screens/analytics/RepsScreen'
import { readAnalyticsSearch } from '~/screens/analytics/search'

export const Route = createFileRoute('/_app/analytics/reps')({
  validateSearch: readAnalyticsSearch,
  component: RepsScreen,
})
