import { createFileRoute } from '@tanstack/react-router'
import { SalesOverview } from '~/screens/sales/SalesOverview'

export const Route = createFileRoute('/_app/sales-history/')({ component: SalesOverview })
