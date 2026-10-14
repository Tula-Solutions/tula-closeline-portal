import { createFileRoute } from '@tanstack/react-router'
import { DealScreen } from '~/screens/sales/DealScreen'

export const Route = createFileRoute('/_app/sales-history/deals/$dealRecordId')({
  component: DealScreen,
})
