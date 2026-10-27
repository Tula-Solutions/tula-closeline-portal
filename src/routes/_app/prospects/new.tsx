import { createFileRoute } from '@tanstack/react-router'
import { NewProspectScreen } from '~/screens/prospects/NewProspectScreen'

export const Route = createFileRoute('/_app/prospects/new')({ component: NewProspectScreen })
