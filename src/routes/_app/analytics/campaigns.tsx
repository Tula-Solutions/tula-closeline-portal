import { createFileRoute } from '@tanstack/react-router'
import { CampaignsScreen } from '~/screens/analytics/CampaignsScreen'
import { readAnalyticsSearch } from '~/screens/analytics/search'

export const Route = createFileRoute('/_app/analytics/campaigns')({
  validateSearch: readAnalyticsSearch,
  component: CampaignsScreen,
})
