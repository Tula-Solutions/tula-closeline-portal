import { createFileRoute } from '@tanstack/react-router'
import { AgentScreen } from '~/screens/agent/AgentScreen'

export const Route = createFileRoute('/_app/agent')({ component: AgentScreen })
