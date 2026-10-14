import { createFileRoute } from '@tanstack/react-router'
import { SearchScreen } from '~/screens/sales/SearchScreen'

export const Route = createFileRoute('/_app/sales-history/search')({ component: SearchScreen })
