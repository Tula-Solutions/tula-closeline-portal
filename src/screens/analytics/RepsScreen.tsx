import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useRole } from '~/data/session-role'
import { ComparisonScreen } from '~/screens/analytics/ComparisonScreen'
import { dayString } from '~/screens/analytics/range'
import { mergeSearch, readAnalyticsSearch } from '~/screens/analytics/search'
import { useDocumentTitle } from '~/ui/useDocumentTitle'

const route = getRouteApi('/_app/analytics/reps')

/** Reps side by side for an Owner, Admin or Manager (a Manager sees their own Reps), or the Rep's own row for a Rep. */
export function RepsScreen() {
  const role = useRole()
  useDocumentTitle(role === 'rep' ? 'Your numbers' : 'Reps')
  const search = readAnalyticsSearch(route.useSearch())
  const navigate = useNavigate({ from: '/analytics/reps' })
  const [today] = useState(() => dayString(new Date()))
  if (role === null) {
    return null
  }
  return (
    <ComparisonScreen
      role={role}
      groupBy='rep'
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
