import { createFileRoute } from '@tanstack/react-router'
import { EscalationRulesScreen } from '~/screens/inbox/EscalationRulesScreen'

export const Route = createFileRoute('/_app/inbox/escalation')({
  component: EscalationRulesScreen,
})
