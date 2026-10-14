import { createFileRoute } from '@tanstack/react-router'
import { ImportsScreen } from '~/screens/sales/ImportsScreen'

export const Route = createFileRoute('/_app/sales-history/imports/')({ component: ImportsScreen })
