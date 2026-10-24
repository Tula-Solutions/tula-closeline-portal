import { createFileRoute } from '@tanstack/react-router'
import { InboxScreen } from '~/screens/inbox/InboxScreen'
import { readInboxSearch } from '~/screens/inbox/search'

export const Route = createFileRoute('/_app/inbox/')({
  // Only values the contract knows stay in the address; anything else is dropped.
  validateSearch: readInboxSearch,
  component: InboxScreen,
})
