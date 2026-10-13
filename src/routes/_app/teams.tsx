import { createFileRoute } from '@tanstack/react-router'
import { TeamsScreen } from '~/screens/TeamsScreen'

export const Route = createFileRoute('/_app/teams')({ component: TeamsScreen })
