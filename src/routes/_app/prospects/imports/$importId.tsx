import { createFileRoute } from '@tanstack/react-router'
import { ProspectImportScreen } from '~/screens/prospects/ProspectImportScreen'

export const Route = createFileRoute('/_app/prospects/imports/$importId')({
  component: ProspectImportScreen,
})
