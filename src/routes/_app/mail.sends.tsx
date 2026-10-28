import { createFileRoute } from '@tanstack/react-router'
import { SEND_STATES } from 'tula-closeline-contract'
import type { SendFilter } from '~/api/outbound'
import { SendLogScreen } from '~/screens/mail/SendLogScreen'

const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined)

export const Route = createFileRoute('/_app/mail/sends')({
  validateSearch: (search: Record<string, unknown>): SendFilter => ({
    campaignId: text(search.campaignId),
    prospectId: text(search.prospectId),
    state: SEND_STATES.find((state) => state === search.state),
  }),
  component: function SendLogRoute() {
    return <SendLogScreen filter={Route.useSearch()} />
  },
})
