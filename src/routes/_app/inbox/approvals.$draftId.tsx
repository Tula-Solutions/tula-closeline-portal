import { createFileRoute } from '@tanstack/react-router'
import { DraftScreen } from '~/screens/inbox/DraftScreen'

export const Route = createFileRoute('/_app/inbox/approvals/$draftId')({
  component: DraftScreen,
})
