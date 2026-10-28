import { createFileRoute } from '@tanstack/react-router'
import { CopilotScreen } from '~/screens/copilot/CopilotScreen'

export const Route = createFileRoute('/_app/copilot-settings')({ component: CopilotScreen })
