import { createFileRoute } from '@tanstack/react-router'
import { OverviewScreen } from '~/screens/analytics/OverviewScreen'
import { readAnalyticsSearch } from '~/screens/analytics/search'

export const Route = createFileRoute('/_app/analytics/')({
  // Only valid values stay in the address; anything else is dropped.
  validateSearch: readAnalyticsSearch,
  component: OverviewScreen,
})
