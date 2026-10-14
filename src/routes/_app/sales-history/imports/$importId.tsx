import { createFileRoute } from '@tanstack/react-router'
import { ImportScreen } from '~/screens/sales/ImportScreen'

export const Route = createFileRoute('/_app/sales-history/imports/$importId')({
  component: ImportScreen,
})
