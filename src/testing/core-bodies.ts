/** An id in the contract's shape: a prefix and 32 hex digits, made from a number. */
export function hexId(prefix: 'mem' | 'inv' | 'team' | 'usr', n: number): string {
  return `${prefix}_${n.toString(16).padStart(32, '0')}`
}

/** A member as core returns it. */
export function memberBody(
  n: number,
  overrides: Partial<{ name: string | null; email: string; role: string }> = {}
) {
  return {
    id: hexId('mem', n),
    userId: hexId('usr', n),
    email: `member${n}@northline.app`,
    name: `Member ${n}`,
    role: 'rep',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

/** An Invitation as core returns it. */
export function invitationBody(
  n: number,
  overrides: Partial<{ email: string; role: string; expiresAt: string }> = {}
) {
  return {
    id: hexId('inv', n),
    email: `invitee${n}@northline.app`,
    role: 'rep',
    teamId: null,
    state: 'pending',
    invitedByUserId: hexId('usr', 1),
    expiresAt: '2099-10-20T09:30:00Z',
    createdAt: '2026-10-13T09:30:00Z',
    ...overrides,
  }
}

/** A Team as core returns it. */
export function teamBody(n: number, name = `Team ${n}`) {
  return {
    id: hexId('team', n),
    name,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  }
}

/** One page of a list, with the cursor of the next page (or none). */
export function page<T>(items: T[], nextCursor: string | null = null) {
  return { items, nextCursor }
}
