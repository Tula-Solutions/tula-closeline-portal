import { type InfiniteData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { MailboxesPage, SendFilter, SendsPage } from '~/api/outbound'
import type { App } from '~/app'
import { useApp } from '~/app-context'
import { KEYS, pagedState, refresh, useOrganizationId } from '~/data/queries'

/** The Mailboxes the caller may see, a page at a time. */
export function useMailboxes() {
  const app = useApp()
  const organizationId = useOrganizationId()
  const query = useInfiniteQuery<
    MailboxesPage,
    Error,
    InfiniteData<MailboxesPage, string | undefined>,
    readonly [string, string, string],
    string | undefined
  >({
    queryKey: [...KEYS.mail(organizationId), 'mailboxes'],
    queryFn: ({ pageParam, signal }) => app.outbound.listMailboxes({ cursor: pageParam, signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: organizationId !== '',
  })
  return pagedState(query)
}

/** The health of one Mailbox, read when its card is opened. */
export function useMailboxHealth(mailboxId: string, enabled: boolean) {
  const app = useApp()
  const organizationId = useOrganizationId()
  return useQuery({
    queryKey: [...KEYS.mail(organizationId), 'health', mailboxId],
    queryFn: ({ signal }) => app.outbound.getHealth(mailboxId, signal),
    enabled: enabled && organizationId !== '',
    retry: false,
  })
}

/** The last domain check of one Mailbox, read when its card is opened. */
export function useDomainCheck(mailboxId: string, enabled: boolean) {
  const app = useApp()
  const organizationId = useOrganizationId()
  return useQuery({
    queryKey: [...KEYS.mail(organizationId), 'domain-check', mailboxId],
    queryFn: ({ signal }) => app.outbound.getDomainCheck(mailboxId, signal),
    enabled: enabled && organizationId !== '',
    retry: false,
  })
}

/** The Organization's mail ceilings, which no Mailbox limit may pass. */
export function useOrganizationMailLimits() {
  const app = useApp()
  const organizationId = useOrganizationId()
  return useQuery({
    queryKey: [...KEYS.mail(organizationId), 'limits'],
    queryFn: ({ signal }) => app.outbound.getOrganizationLimits(signal),
    enabled: organizationId !== '',
    retry: false,
  })
}

/** The send log, a page at a time; the filter is part of the key because a cursor belongs to its filter. */
export function useSends(filter: SendFilter) {
  const app = useApp()
  const organizationId = useOrganizationId()
  const query = useInfiniteQuery<
    SendsPage,
    Error,
    InfiniteData<SendsPage, string | undefined>,
    readonly [string, string, string, SendFilter],
    string | undefined
  >({
    queryKey: [...KEYS.mail(organizationId), 'sends', filter],
    queryFn: ({ pageParam, signal }) =>
      app.outbound.listSends({ cursor: pageParam, signal }, filter),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: organizationId !== '',
  })
  return pagedState(query)
}

/**
 * Refreshes every Mailbox and send-log read after a change. A read still in flight would answer
 * from before the change and clear the stale mark, so it is cancelled first.
 */
export async function refreshMail(app: App): Promise<void> {
  const snapshot = app.session.getSnapshot()
  if (snapshot.status === 'signed_in') {
    await app.queryClient.cancelQueries({ queryKey: KEYS.mail(snapshot.organization.id) })
  }
  await refresh(app, 'mail')
}
