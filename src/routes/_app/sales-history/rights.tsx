import { createFileRoute } from '@tanstack/react-router'
import { parseBackPath } from '~/data/sales-history'
import { RightsScreen } from '~/screens/sales/RightsScreen'

export const Route = createFileRoute('/_app/sales-history/rights')({
  validateSearch: (search: Record<string, unknown>) => {
    const from = parseBackPath(search.from)
    return from === undefined ? {} : { from }
  },
  component: RightsScreen,
})
