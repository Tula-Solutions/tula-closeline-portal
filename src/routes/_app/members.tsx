import { createFileRoute } from '@tanstack/react-router'
import { MembersScreen } from '~/screens/MembersScreen'

export const Route = createFileRoute('/_app/members')({ component: MembersScreen })
