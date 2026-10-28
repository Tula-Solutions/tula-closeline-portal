import { useQuery } from '@tanstack/react-query'
import { OUTBOUND_LIST_LIMIT } from '~/api/outbound'
import type { App } from '~/app'
import { useApp } from '~/app-context'
import { useOrganizationId } from '~/data/queries'

const key = (organizationId: string, ...rest: readonly (string | boolean)[]) =>
  [organizationId, 'enrichment', ...rest] as const

/** The most Signals the Prospect page shows; the newest come first. */
export const SIGNALS_SHOWN = 10

/** Refreshes every enrichment, Signal and Fit read of the signed-in Organization. */
export function refreshEnrichment(app: App): Promise<void> {
  const snapshot = app.session.getSnapshot()
  if (snapshot.status !== 'signed_in') {
    return Promise.resolve()
  }
  return app.queryClient.invalidateQueries({
    queryKey: [snapshot.organization.id, 'enrichment'],
  })
}

/** What is known about one Prospect: its enriched fields with provenance and cost. */
export function useProspectEnrichment(prospectId: string) {
  const app = useApp()
  const organizationId = useOrganizationId()
  return useQuery({
    queryKey: key(organizationId, 'prospect', prospectId),
    queryFn: ({ signal }) => app.outbound.getProspectEnrichment(prospectId, signal),
    enabled: organizationId !== '',
  })
}

/** The newest run for one Prospect (status and stop reason), or null. */
export function useLatestRun(prospectId: string) {
  const app = useApp()
  const organizationId = useOrganizationId()
  return useQuery({
    queryKey: key(organizationId, 'run', prospectId),
    queryFn: ({ signal }) => app.outbound.getLatestRun(prospectId, signal),
    enabled: organizationId !== '',
  })
}

/** The newest Signals of one Prospect. */
export function useSignals(prospectId: string) {
  const app = useApp()
  const organizationId = useOrganizationId()
  return useQuery({
    queryKey: key(organizationId, 'signals', prospectId),
    queryFn: ({ signal }) => app.outbound.listSignals(prospectId, SIGNALS_SHOWN, signal),
    enabled: organizationId !== '',
  })
}

/** How one Prospect scores against the Fit Criteria, and why. */
export function useProspectFit(prospectId: string) {
  const app = useApp()
  const organizationId = useOrganizationId()
  return useQuery({
    queryKey: key(organizationId, 'fit', prospectId),
    queryFn: ({ signal }) => app.outbound.getProspectFit(prospectId, signal),
    enabled: organizationId !== '',
  })
}

/** The settings reads, made only for a role that may see them (`enabled` is false for the rest). */
export function useEnrichmentSettings(enabled: boolean) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const on = enabled && organizationId !== ''
  const providers = useQuery({
    queryKey: key(organizationId, 'providers'),
    queryFn: ({ signal }) => app.outbound.listProviders(signal),
    enabled: on,
  })
  const waterfall = useQuery({
    queryKey: key(organizationId, 'waterfall'),
    queryFn: ({ signal }) => app.outbound.getWaterfall(signal),
    enabled: on,
  })
  const budget = useQuery({
    queryKey: key(organizationId, 'budget'),
    queryFn: ({ signal }) => app.outbound.getBudget(signal),
    enabled: on,
  })
  const spend = useQuery({
    queryKey: key(organizationId, 'spend'),
    queryFn: ({ signal }) => app.outbound.listSpend(signal),
    enabled: on,
  })
  const criteria = useQuery({
    queryKey: key(organizationId, 'criteria'),
    queryFn: ({ signal }) => app.outbound.listFitCriteria(signal),
    enabled: on,
  })
  return { providers, waterfall, budget, spend, criteria, limit: OUTBOUND_LIST_LIMIT }
}
