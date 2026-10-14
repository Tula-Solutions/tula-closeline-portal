/** An id in the contract's shape: a prefix and 32 hex digits, made from a number. */
export function hexId(
  prefix: 'mem' | 'inv' | 'team' | 'usr' | 'doc' | 'deal' | 'dimp' | 'call',
  n: number
): string {
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

/** A Playbook document as the playbook service returns it: a ready PDF unless overridden. */
export function documentBody(
  n: number,
  overrides: Partial<{
    fileName: string
    mediaType: string
    sizeBytes: number
    pageCount: number | null
    state: string
    failureReason: string | null
    deletedAt: string | null
    purgeAt: string | null
  }> = {}
) {
  return {
    id: hexId('doc', n),
    fileName: `Document ${n}.pdf`,
    mediaType: 'application/pdf',
    sizeBytes: 2048,
    pageCount: 12,
    state: 'ready',
    failureReason: null,
    deletedAt: null,
    purgeAt: null,
    uploadedByUserId: hexId('usr', 1),
    createdAt: '2026-10-13T09:30:00Z',
    updatedAt: '2026-10-13T09:31:00Z',
    ...overrides,
  }
}

/** A Deal as the playbook service returns it: an open Deal with no money unless overridden. */
export function dealBody(
  n: number,
  overrides: Partial<{
    dealId: string
    name: string | null
    outcome: string
    closedAt: string | null
    amount: string | null
    currency: string | null
    callCount: number
    appearedInImport: boolean
  }> = {}
) {
  return {
    id: hexId('deal', n),
    dealId: `D-${n}`,
    name: null,
    outcome: 'open',
    closedAt: null,
    amount: null,
    currency: null,
    callCount: 0,
    appearedInImport: true,
    createdAt: '2026-10-13T09:30:00Z',
    updatedAt: '2026-10-13T09:31:00Z',
    ...overrides,
  }
}

/** A Deal import as the playbook service returns it: a completed one with 3 rows, 2 applied, 1 rejected. */
export function importBody(
  n: number,
  overrides: Partial<{
    state: string
    failureReason: string | null
    rowCount: number | null
    appliedCount: number | null
    rejectedCount: number | null
  }> = {}
) {
  return {
    id: hexId('dimp', n),
    state: 'completed',
    failureReason: null,
    rowCount: 3,
    appliedCount: 2,
    rejectedCount: 1,
    uploadedByUserId: hexId('usr', 1),
    createdAt: '2026-10-13T09:30:00Z',
    updatedAt: '2026-10-13T09:31:00Z',
    ...overrides,
  }
}

/** One row of an import's report. */
export function rowBody(
  rowNumber: number,
  overrides: Partial<{ dealId: string | null; result: string; reason: string | null }> = {}
) {
  return { rowNumber, dealId: `D-${rowNumber}`, result: 'applied', reason: null, ...overrides }
}

/** The rights confirmation status: confirmed at the current version unless overridden. */
export function rightsBody(
  overrides: Partial<{
    currentWordingVersion: number
    confirmedVersion: number | null
  }> = {}
) {
  const current = overrides.currentWordingVersion ?? 1
  const confirmed = overrides.confirmedVersion === undefined ? current : overrides.confirmedVersion
  return {
    currentWordingVersion: current,
    confirmation:
      confirmed === null
        ? null
        : {
            wordingVersion: confirmed,
            confirmedByUserId: hexId('usr', 1),
            confirmedAt: '2026-10-12T08:00:00Z',
          },
    confirmed: confirmed === current,
  }
}

/** One page of a list, with the cursor of the next page (or none). */
export function page<T>(items: T[], nextCursor: string | null = null) {
  return { items, nextCursor }
}

/** A Transcript Call as the playbook service returns it: ready, of a won Deal, in search. */
export function callBody(
  n: number,
  overrides: Partial<{
    dealId: string
    dealRecordId: string
    dealOutcome: string
    inSearch: boolean
    kind: string
    mediaType: string
    fileName: string
    state: string
    failureReason: string | null
    rep: { by: 'speaker'; label: string } | { by: 'channel'; channel: string } | null
    speakerLabels: string[]
    deletedAt: string | null
    purgeAt: string | null
  }> = {}
) {
  return {
    id: hexId('call', n),
    dealId: `D-${n}`,
    dealRecordId: hexId('deal', n),
    dealOutcome: 'won',
    inSearch: true,
    kind: 'transcript',
    fileName: `call-${n}.txt`,
    mediaType: 'text/plain',
    sizeBytes: 2048,
    durationSeconds: null,
    state: 'ready',
    failureReason: null,
    rep: { by: 'speaker', label: 'Sam' },
    speakerLabels: ['Sam', 'Pat'],
    deletedAt: null,
    purgeAt: null,
    uploadedByUserId: hexId('usr', 1),
    createdAt: '2026-10-13T09:30:00Z',
    updatedAt: '2026-10-13T09:31:00Z',
    ...overrides,
  }
}
