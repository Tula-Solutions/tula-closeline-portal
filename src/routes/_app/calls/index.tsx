import { createFileRoute } from '@tanstack/react-router'
import { CallHistoryScreen } from '~/screens/calls/CallHistoryScreen'

export const Route = createFileRoute('/_app/calls/')({ component: CallHistoryScreen })
