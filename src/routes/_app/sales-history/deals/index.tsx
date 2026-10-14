import { createFileRoute } from '@tanstack/react-router'
import { DealsScreen } from '~/screens/sales/DealsScreen'

export const Route = createFileRoute('/_app/sales-history/deals/')({ component: DealsScreen })
