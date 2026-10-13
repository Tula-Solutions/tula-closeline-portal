import { createFileRoute } from '@tanstack/react-router'
import { InvitationsScreen } from '~/screens/InvitationsScreen'

export const Route = createFileRoute('/_app/invitations')({ component: InvitationsScreen })
