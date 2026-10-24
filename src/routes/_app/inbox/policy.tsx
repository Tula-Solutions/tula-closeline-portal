import { createFileRoute } from '@tanstack/react-router'
import { ApprovalPolicyScreen } from '~/screens/inbox/ApprovalPolicyScreen'

export const Route = createFileRoute('/_app/inbox/policy')({
  component: ApprovalPolicyScreen,
})
