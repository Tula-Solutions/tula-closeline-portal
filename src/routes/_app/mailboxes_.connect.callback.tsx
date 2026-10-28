import { createFileRoute } from '@tanstack/react-router'
import { MailboxesScreen, type MailboxReturn } from '~/screens/mail/MailboxesScreen'

const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined)

export const Route = createFileRoute('/_app/mailboxes_/connect/callback')({
  // The provider returns a one-time code and the `state`; the screen takes them out of the address at once.
  validateSearch: (search: Record<string, unknown>): MailboxReturn => ({
    code: text(search.code),
    state: text(search.state),
    error: text(search.error),
  }),
  component: function MailboxCallbackRoute() {
    return <MailboxesScreen returned={Route.useSearch()} />
  },
})
