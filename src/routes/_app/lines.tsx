import { createFileRoute } from '@tanstack/react-router'
import { LinesScreen } from '~/screens/LinesScreen'

export const Route = createFileRoute('/_app/lines')({ component: LinesScreen })
