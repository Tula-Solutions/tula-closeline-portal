import type { Call } from '~/testing/fixtures'

/** An id of the form the contract accepts: a prefix and 32 hex digits. */
export const mailId = (prefix: string, n: number) => `${prefix}_${n.toString(16).padStart(32, '0')}`

const NOW = '2026-10-01T10:00:00.000Z'

/** A Mailbox body as the outbound service returns it, with changes. */
export function mailbox(n: number, changes: Record<string, unknown> = {}) {
  return {
    id: mailId('mbx', n),
    provider: 'gmail',
    kind: 'personal',
    address: `rep${n}@northline.app`,
    displayName: `Rep ${n}`,
    ownerMembershipId: mailId('mem', 1),
    teamIds: [],
    state: 'healthy',
    stateReason: null,
    limits: {
      perDay: 100,
      perHour: 20,
      minGapSeconds: 30,
      window: {
        timeZone: 'Europe/London',
        days: ['mon', 'tue', 'wed', 'thu', 'fri'],
        startMinute: 540,
        endMinute: 1020,
      },
    },
    effectiveLimits: { perDay: 100, perHour: 20, minGapSeconds: 30 },
    ramp: { active: false, dayIndex: 0, perDayNow: 100, steps: [] },
    health: { status: 'not_enough_data', score: null, effect: 'none', scoredAt: NOW },
    connectedAt: NOW,
    lastSyncedAt: NOW,
    ...changes,
  }
}

/** The Organization's mail ceilings. */
export const CEILINGS = {
  perDayCeiling: 200,
  perHourCeiling: 40,
  minGapFloorSeconds: 10,
  organizationDailyCap: 1000,
}

/** The query string of a recorded call, as an object. */
export const queryOf = (call: Call) =>
  Object.fromEntries(new URL(call.url, 'http://x.test').searchParams)
