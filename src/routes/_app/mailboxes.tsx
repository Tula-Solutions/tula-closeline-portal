import { createFileRoute } from '@tanstack/react-router'
import { MailboxesScreen } from '~/screens/mail/MailboxesScreen'

export const Route = createFileRoute('/_app/mailboxes')({ component: MailboxesScreen })
