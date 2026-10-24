import { createFileRoute } from '@tanstack/react-router'
import { DevelopersScreen } from '~/screens/DevelopersScreen'

export const Route = createFileRoute('/_app/developers')({ component: DevelopersScreen })
