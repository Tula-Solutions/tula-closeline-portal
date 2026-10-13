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
  /** Adding `membershipId` to the Team `teamId`. */
  teamMember: (teamId: string, membershipId: string) =>
    JSON.stringify(['team-member', teamId, membershipId]),
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
