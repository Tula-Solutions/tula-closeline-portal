import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { PageHeader } from '~/components/app/page-header'
import { can } from '~/data/permissions'
import { useRole } from '~/data/session-role'
import { ComparisonScreen } from '~/screens/analytics/ComparisonScreen'
import { dayString } from '~/screens/analytics/range'
import { mergeSearch, readAnalyticsSearch } from '~/screens/analytics/search'
import { useDocumentTitle } from '~/ui/useDocumentTitle'

const route = getRouteApi('/_app/analytics/campaigns')

/** Campaigns side by side, for an Owner or Admin; any other role is told so and nothing is asked of core. */
export function CampaignsScreen() {
  useDocumentTitle('Campaigns')
  const role = useRole()
  const search = readAnalyticsSearch(route.useSearch())
  const navigate = useNavigate({ from: '/analytics/campaigns' })
  const [today] = useState(() => dayString(new Date()))
  if (role === null) {
    return null
  }
  if (!can.compareCampaigns(role)) {
    return (
      <PageHeader
        eyebrow='Analytics'
        title='Campaigns'
        description='Comparing Campaigns is for an Owner or Admin. Your own numbers are under Your numbers.'
      />
    )
  }
  return (
    <ComparisonScreen
      role={role}
      groupBy='campaign'
      search={search}
      today={today}
      onChange={(next) =>
        void navigate({
          search: (now) => mergeSearch(readAnalyticsSearch(now), next),
          replace: true,
        })
      }
    />
  )
}
