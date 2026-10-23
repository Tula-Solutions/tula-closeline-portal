import { createFileRoute } from '@tanstack/react-router'
import {
  MAX_PROSPECT_SEARCH_LENGTH,
  type MembershipId,
  membershipIdSchema,
  type ProspectCompanyId,
  prospectCompanyIdSchema,
} from 'tula-closeline-contract'
import { ProspectsScreen } from '~/screens/prospects/ProspectsScreen'

/** What the address of the list may carry; each is optional and checked by shape. */
export type ProspectsSearch = {
  q?: string
  status?: 'active' | 'archived'
  source?: string
  owner?: MembershipId
  company?: ProspectCompanyId
}

export const Route = createFileRoute('/_app/prospects/')({
  // Only values of the right shape stay in the address; anything else is dropped.
  validateSearch: (search: Record<string, unknown>): ProspectsSearch => {
    const q =
      typeof search.q === 'string' ? search.q.trim().slice(0, MAX_PROSPECT_SEARCH_LENGTH) : ''
    const owner = membershipIdSchema.safeParse(search.owner)
    const company = prospectCompanyIdSchema.safeParse(search.company)
    return {
      ...(q === '' ? {} : { q }),
      ...(search.status === 'active' || search.status === 'archived'
        ? { status: search.status }
        : {}),
      ...(typeof search.source === 'string' && search.source !== '' && search.source.length <= 60
        ? { source: search.source }
        : {}),
      ...(owner.success ? { owner: owner.data } : {}),
      ...(company.success ? { company: company.data } : {}),
    }
  },
  component: ProspectsScreen,
})
