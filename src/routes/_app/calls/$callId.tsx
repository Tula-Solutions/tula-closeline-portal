import { createFileRoute } from '@tanstack/react-router'
import { CallDetailScreen } from '~/screens/calls/CallDetailScreen'

export const Route = createFileRoute('/_app/calls/$callId')({ component: CallDetailScreen })
