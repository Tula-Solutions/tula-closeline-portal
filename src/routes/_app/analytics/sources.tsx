import { createFileRoute } from '@tanstack/react-router'
import { SourcesScreen } from '~/screens/attribution/SourcesScreen'

export const Route = createFileRoute('/_app/analytics/sources')({
  // Only the one known flag stays in the address; anything else is dropped.
  validateSearch: (search: Record<string, unknown>): { flag?: 'cited_often_lost' } =>
    search.flag === 'cited_often_lost' ? { flag: 'cited_often_lost' } : {},
  component: SourcesScreen,
})
