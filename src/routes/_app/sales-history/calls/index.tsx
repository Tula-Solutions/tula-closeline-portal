import { createFileRoute } from '@tanstack/react-router'
import { dealRecordIdSchema } from 'tula-closeline-contract'
import { CallsScreen } from '~/screens/sales/CallsScreen'

export const Route = createFileRoute('/_app/sales-history/calls/')({
  // Only the opaque `deal_…` id may be in the address; anything else is dropped.
  validateSearch: (search: Record<string, unknown>) => {
    const deal = dealRecordIdSchema.safeParse(search.deal)
    return deal.success ? { deal: deal.data } : {}
  },
  component: CallsScreen,
})
