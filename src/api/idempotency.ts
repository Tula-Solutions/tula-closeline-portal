import { idempotencyKeySchema } from 'tula-closeline-contract'
import { outcomeUnknown } from '~/api/manage-messages'

/** Remembers the idempotency key of the request in flight, so a retry of the same request reuses it. */
export type KeyHolder = {
  /** The key for a request with this fingerprint: the held one if the fingerprint is the same, else a new one. */
  keyFor(fingerprint: string): string
  /** The request is done: the next one gets a new key. */
  succeeded(): void
  /** The request failed: the key is kept only if the server may have received it (see `outcomeUnknown`). */
  failed(error: unknown): void
}

/** Makes a key holder; `makeKey` is injectable so tests can see what is generated. */
export function createKeyHolder(
  makeKey: () => string = () => `portal-${crypto.randomUUID()}`
): KeyHolder {
  let held: { readonly fingerprint: string; readonly key: string } | null = null
  return {
    keyFor(fingerprint) {
      if (held === null || held.fingerprint !== fingerprint) {
        const key = makeKey()
        idempotencyKeySchema.parse(key)
        held = { fingerprint, key }
      }
      return held.key
    },
    succeeded() {
      held = null
    },
    failed(error) {
      if (!outcomeUnknown(error)) {
        held = null
      }
    },
  }
}
