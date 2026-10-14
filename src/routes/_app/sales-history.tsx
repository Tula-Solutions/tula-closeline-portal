import { createFileRoute } from '@tanstack/react-router'
import { SalesLayout } from '~/screens/sales/SalesLayout'

export const Route = createFileRoute('/_app/sales-history')({ component: SalesLayout })
