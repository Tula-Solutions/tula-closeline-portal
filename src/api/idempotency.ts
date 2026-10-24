import { INVITABLE_ROLES, idempotencyKeySchema } from 'tula-closeline-contract'
import { outcomeUnknown } from '~/api/manage-messages'

/** One try of one write: its key, and how it ended. */
export type Attempt = {
  readonly key: string
  /** The write was done: its key is finished. Ignored if the holder was cleared since the attempt began. */
  succeeded(): void
  /** The write failed: its key is kept only if the server may have received it (see `outcomeUnknown`). Ignored if the holder was cleared since. */
  failed(error: unknown): void
}

/** Remembers the idempotency key of each write whose outcome may be unknown, so a retry of the same intent reuses it. */
export type KeyHolder = {
  /** Starts a try: the held key for this exact intent, or a new one. */
  begin(fingerprint: string): Attempt
  /** Forgets the key of one intent that is over or changed (a revoke, a delete, a remove). */
  drop(fingerprint: string): void
  /** Forgets every key and disowns every try in flight (sign-out, another Organization). */
  clear(): void
  /** How many keys are held (for tests). */
  size(): number
}

/**
 * The most keys held at once. A key is held only while a write's outcome is unknown, and a person
 * has a handful of those at a time, so 32 is far above real use; the cap keeps memory fixed however
 * long the tab lives. The oldest-used key is dropped first: its retry would get a new key, which is
 * safe for a write core de-duplicates by its own rules (a pending Invitation, a Team name).
 */
export const MAX_HELD_KEYS = 32

/** The fingerprints: everything that identifies an intent (its kind, path parameters and body), as one string. */
export const fingerprint = {
  /** Inviting `email` for `role`. */
  invitation: (email: string, role: string) => JSON.stringify(['invitation', email, role]),
  /** Creating a Team called `name`. */
  team: (name: string) => JSON.stringify(['team', name]),
  /** Creating a Prospect from this body (as JSON text, so the same details are the same intent). */
  prospect: (body: string) => JSON.stringify(['prospect', body]),
  /** Creating a Prospect Company called `name`. */
  prospectCompany: (name: string) => JSON.stringify(['prospect-company', name]),
  /** Uploading a file with this name, size and last-modified time (the same file chosen again is the same intent). */
  document: (name: string, size: number, modified: number) =>
    JSON.stringify(['document', name, size, modified]),
  /** Uploading a Deal import CSV with this name, size and last-modified time. */
  dealImport: (name: string, size: number, modified: number) =>
    JSON.stringify(['deal-import', name, size, modified]),
  /** Uploading a Prospect import CSV with this name, size and last-modified time. */
  prospectImport: (name: string, size: number, modified: number) =>
    JSON.stringify(['prospect-import', name, size, modified]),
  /** Uploading a Transcript or Recording: the file (name, size, modified time), the deal id and the Rep choice as JSON text (empty for none), which together are one intent. */
  call: (name: string, size: number, modified: number, dealId: string, rep: string) =>
    JSON.stringify(['call', name, size, modified, dealId, rep]),
  /** Adding a Line with this request body (as JSON): the same body is the same intent. */
  line: (body: string) => JSON.stringify(['line', body]),
  /** Creating an API key with this request body (as JSON): the same name, scopes, ceiling and expiry are the same intent. */
  apiKey: (body: string) => JSON.stringify(['api-key', body]),
  /** Asking for an export with this body (as JSON): the same options are the same intent. */
  exportRequest: (body: string) => JSON.stringify(['export-request', body]),
  /** Asking for a download link of the export `exportId`. */
  exportDownload: (exportId: string) => JSON.stringify(['export-download', exportId]),
  /** Revoking the API key `apiKeyId`. */
  apiKeyRevoke: (apiKeyId: string) => JSON.stringify(['api-key-revoke', apiKeyId]),
  /** Recording a grant on a Prospect with this body (as JSON): the same grant is the same intent. */
  consentGrant: (prospectId: string, body: string) =>
    JSON.stringify(['consent-grant', prospectId, body]),
  /** Withdrawing consent on a Prospect with this body (as JSON). */
  consentWithdrawal: (prospectId: string, body: string) =>
    JSON.stringify(['consent-withdrawal', prospectId, body]),
  /** Writing a Consent Wording with this body (as JSON), or its next version when `wordingId` is given. */
  consentWording: (wordingId: string, body: string) =>
    JSON.stringify(['consent-wording', wordingId, body]),
  /** Adding an address to Suppression with this body (as JSON). */
  suppression: (body: string) => JSON.stringify(['suppression', body]),
  /** Deciding the Draft `draftId`: `kind` is approve, edit-approve or reject, `body` the request as JSON text (so the same decision is the same intent). */
  draftDecision: (draftId: string, kind: 'approve' | 'edit-approve' | 'reject', body: string) =>
    JSON.stringify(['draft-decision', draftId, kind, body]),
  /** Adding `membershipId` to the Team `teamId`. */
  teamMember: (teamId: string, membershipId: string) =>
    JSON.stringify(['team-member', teamId, membershipId]),
  /** Removing `membershipId` from the Team `teamId`: its own intent, apart from adding. */
  teamMemberRemoval: (teamId: string, membershipId: string) =>
    JSON.stringify(['team-member-removal', teamId, membershipId]),
}

/** Drops every key for inviting `email`, whatever role was offered. */
export function dropInvitationKeys(holder: KeyHolder, email: string): void {
  for (const role of INVITABLE_ROLES) {
    holder.drop(fingerprint.invitation(email, role))
  }
}

/** Makes a key holder; `makeKey` is injectable so tests can see what is generated. */
export function createKeyHolder(
  makeKey: () => string = () => `portal-${crypto.randomUUID()}`,
  max: number = MAX_HELD_KEYS
): KeyHolder {
  const held = new Map<string, string>()
  let epoch = 0
  return {
    begin(print) {
      let key = held.get(print)
      if (key === undefined) {
        key = makeKey()
        idempotencyKeySchema.parse(key)
      }
      // Re-insert so the Map's order is least recently used first.
      held.delete(print)
      held.set(print, key)
      while (held.size > max) {
        const oldest = held.keys().next().value
        if (oldest === undefined) {
          break
        }
        held.delete(oldest)
      }
      const startedIn = epoch
      return {
        key,
        succeeded() {
          if (epoch === startedIn) {
            held.delete(print)
          }
        },
        failed(error) {
          if (epoch === startedIn && !outcomeUnknown(error)) {
            held.delete(print)
          }
        },
      }
    },
    drop(print) {
      held.delete(print)
    },
    clear() {
      epoch += 1
      held.clear()
    },
    size: () => held.size,
  }
}
