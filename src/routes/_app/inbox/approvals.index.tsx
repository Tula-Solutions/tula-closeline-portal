import { createFileRoute } from '@tanstack/react-router'
import { ApprovalQueueScreen } from '~/screens/inbox/ApprovalQueueScreen'
import { readInboxSearch } from '~/screens/inbox/search'

export const Route = createFileRoute('/_app/inbox/approvals/')({
  // Only the channel narrows the queue; anything else is dropped from the address.
  validateSearch: (search: Record<string, unknown>) => {
    const { channel } = readInboxSearch(search)
    return channel === undefined ? {} : { channel }
  },
  component: ApprovalQueueScreen,
})
