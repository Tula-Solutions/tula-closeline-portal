import { createFileRoute } from '@tanstack/react-router'
import { AttributionScreen } from '~/screens/attribution/AttributionScreen'

export const Route = createFileRoute('/_app/analytics/deals/$dealRecordId')({
  component: AttributionScreen,
})
