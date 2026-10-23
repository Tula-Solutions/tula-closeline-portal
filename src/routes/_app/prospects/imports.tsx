import { createFileRoute } from '@tanstack/react-router'
import { ProspectImportsLayout } from '~/screens/prospects/ProspectImportsLayout'

export const Route = createFileRoute('/_app/prospects/imports')({
  component: ProspectImportsLayout,
})
