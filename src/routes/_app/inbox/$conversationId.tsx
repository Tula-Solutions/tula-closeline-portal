import { createFileRoute } from '@tanstack/react-router'
import { ConversationScreen } from '~/screens/inbox/ConversationScreen'

export const Route = createFileRoute('/_app/inbox/$conversationId')({
  component: ConversationScreen,
})
