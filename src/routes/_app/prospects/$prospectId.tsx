import { createFileRoute } from '@tanstack/react-router'
import { ProspectScreen } from '~/screens/prospects/ProspectScreen'

export const Route = createFileRoute('/_app/prospects/$prospectId')({ component: ProspectScreen })
