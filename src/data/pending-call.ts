/** A Transcript upload the person has chosen but not sent, held while they confirm the rights wording. */
export type PendingCall = {
  readonly organizationId: string
  readonly file: File
  /** The customer's deal id as typed: held in memory only, never in an address, storage or a log. */
  readonly dealId: string
  readonly repLabel: string
}

/**
 * Holds one chosen Transcript, in memory only, across the trip to the rights confirmation page
 * and back. Nothing is written to storage, an address or the history state. It belongs to the
 * Organization it was chosen in and is dropped on sign-out or another Organization.
 */
export type PendingCallHolder = {
  /** Keeps `call`, replacing any earlier one. */
  hold(call: PendingCall): void
  /** The held call if it belongs to `organizationId`; a held call of another Organization is dropped. Leaves it held. */
  peek(organizationId: string): PendingCall | null
  /** Like `peek`, and forgets it. */
  take(organizationId: string): PendingCall | null
  /** Forgets whatever is held. */
  clear(): void
}

/** Makes an empty holder. */
export function createPendingCall(): PendingCallHolder {
  let held: PendingCall | null = null
  const peek = (organizationId: string) => {
    if (held !== null && held.organizationId !== organizationId) {
      held = null
    }
    return held
  }
  return {
    hold: (call) => {
      held = call
    },
    peek,
    take: (organizationId) => {
      const found = peek(organizationId)
      held = null
      return found
    },
    clear: () => {
      held = null
    },
  }
}
