import { createFileRoute } from '@tanstack/react-router'
import { ProspectImportsScreen } from '~/screens/prospects/ProspectImportsScreen'

export const Route = createFileRoute('/_app/prospects/imports/')({
  component: ProspectImportsScreen,
})
