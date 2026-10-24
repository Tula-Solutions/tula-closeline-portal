/** An id in the contract's shape: a prefix and 32 hex digits, made from a number. */
export function hexId(
  prefix:
    | 'mem'
    | 'inv'
    | 'team'
    | 'usr'
    | 'doc'
    | 'deal'
    | 'dimp'
    | 'call'
    | 'prs'
    | 'pco'
    | 'pimp'
    | 'line'
    | 'akey'
    | 'cev'
    | 'cwd'
    | 'sup',
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

/** A Prospect as core returns it: a manual Prospect with a name and an email address unless overridden. */
export function prospectBody(
  n: number,
  overrides: Partial<{
    status: string
    source: string
    tags: string[]
    notes: string | null
    companyId: string | null
    ownerMembershipId: string | null
    fields: Record<string, unknown>
  }> = {}
) {
  const set = (value: string, source = 'manual') => ({
    value,
    source,
    sourceRef: null,
    setAt: '2026-10-02T08:30:00Z',
    setByUserId: hexId('usr', 1),
  })
  return {
    id: hexId('prs', n),
    companyId: null,
    ownerMembershipId: hexId('mem', 1),
    status: 'active',
    source: 'manual',
    tags: [],
    notes: null,
    fields: {
      firstName: set(`First${n}`),
      lastName: set(`Last${n}`),
      email: set(`prospect${n}@example.com`),
    },
    createdAt: '2026-10-02T08:30:00Z',
    updatedAt: '2026-10-02T08:30:00Z',
    ...overrides,
  }
}

/** A Prospect Company as core returns it. */
export function companyBody(n: number, name = `Company ${n}`) {
  return {
    id: hexId('pco', n),
    fields: {
      name: {
        value: name,
        source: 'manual',
        sourceRef: null,
        setAt: '2026-10-02T08:30:00Z',
        setByUserId: hexId('usr', 1),
      },
    },
    createdAt: '2026-10-02T08:30:00Z',
    updatedAt: '2026-10-02T08:30:00Z',
  }
}

/** A Prospect import as core returns it: a completed one with 5 rows (2 created, 1 updated, 1 skipped, 1 rejected). */
export function prospectImportBody(
  n: number,
  overrides: Partial<{
    state: string
    failureReason: string | null
    rowCount: number | null
    createdCount: number | null
    updatedCount: number | null
    skippedCount: number | null
    rejectedCount: number | null
  }> = {}
) {
  return {
    id: hexId('pimp', n),
    state: 'completed',
    failureReason: null,
    rowCount: 5,
    createdCount: 2,
    updatedCount: 1,
    skippedCount: 1,
    rejectedCount: 1,
    uploadedByUserId: hexId('usr', 1),
    createdAt: '2026-10-13T09:30:00Z',
    updatedAt: '2026-10-13T09:31:00Z',
    ...overrides,
  }
}

/** A Prospect import still on its way: no counts yet. */
export function runningImportBody(n: number, state: 'uploaded' | 'processing' = 'processing') {
  return prospectImportBody(n, {
    state,
    rowCount: null,
    createdCount: null,
    updatedCount: null,
    skippedCount: null,
    rejectedCount: null,
  })
}

/** One row of a Prospect import's report. */
export function prospectImportRowBody(
  rowNumber: number,
  overrides: Partial<{ result: string; reason: string | null; prospectId: string | null }> = {}
) {
  return {
    rowNumber,
    result: 'created',
    reason: null,
    prospectId: hexId('prs', rowNumber),
    ...overrides,
  }
}

/** A Line as the voice service returns it. */
export function lineBody(
  n: number,
  overrides: Partial<{
    number: string
    label: string | null
    state: 'porting' | 'active' | 'released'
    assignment:
      | { kind: 'unassigned' }
      | { kind: 'team'; teamId: string }
      | { kind: 'rep'; membershipId: string }
  }> = {}
) {
  return {
    id: hexId('line', n),
    number: `+1415555${String(n).padStart(4, '0')}`,
    country: 'US',
    label: null,
    state: 'active',
    assignment: { kind: 'unassigned' },
    createdAt: '2026-10-01T00:00:00Z',
    releasedAt: overrides.state === 'released' ? '2026-10-02T00:00:00Z' : null,
    ...overrides,
  }
}

/** The five channels in the contract's order, for a Prospect's consent. */
const CONSENT_CHANNEL_ORDER = ['phone', 'sms', 'whatsapp', 'email', 'linkedin'] as const

/** A Prospect's consent as core returns it: every channel once, `none` unless overridden. */
export function consentBody(
  prospectN: number,
  states: Partial<Record<(typeof CONSENT_CHANNEL_ORDER)[number], 'granted' | 'withdrawn'>> = {},
  overrides: Partial<{ suppressed: boolean; suppressionReason: string | null }> = {}
) {
  return {
    prospectId: hexId('prs', prospectN),
    channels: CONSENT_CHANNEL_ORDER.map((channel, index) => {
      const state = states[channel] ?? 'none'
      return {
        channel,
        state,
        since: state === 'none' ? null : '2026-10-03T10:00:00Z',
        lastEventId: state === 'none' ? null : hexId('cev', index + 1),
        wordingId: state === 'granted' ? hexId('cwd', 1) : null,
      }
    }),
    suppressed: false,
    suppressionReason: null,
    ...overrides,
  }
}

/** One entry of a Prospect's consent ledger as core returns it. */
export function consentEventBody(
  n: number,
  overrides: Partial<{
    channel: string
    kind: string
    source: string
    wordingId: string | null
    evidenceRef: string | null
    callId: string | null
    stopAll: boolean
    occurredAt: string
  }> = {}
) {
  return {
    id: hexId('cev', n),
    prospectId: hexId('prs', 1),
    channel: 'phone',
    kind: 'granted',
    source: 'verbal_call',
    wordingId: hexId('cwd', 1),
    evidenceRef: 'Call notes, 3 October',
    callId: hexId('call', 1),
    formId: null,
    stopAll: false,
    recordedByUserId: hexId('usr', 1),
    occurredAt: '2026-10-03T10:00:00Z',
    recordedAt: '2026-10-03T10:00:05Z',
    ...overrides,
  }
}

/** One withdrawal in a Prospect's consent ledger: it carries no wording, evidence or Call. */
export function withdrawalEventBody(
  n: number,
  overrides: Parameters<typeof consentEventBody>[1] = {}
) {
  return consentEventBody(n, {
    kind: 'withdrawn',
    source: 'manual',
    wordingId: null,
    evidenceRef: null,
    callId: null,
    ...overrides,
  })
}

/** A Consent Wording as core returns it. */
export function wordingBody(
  n: number,
  overrides: Partial<{ text: string; channels: string[]; version: number }> = {}
) {
  return {
    id: hexId('cwd', n),
    version: 1,
    text: `We may call you about Northline products (wording ${n}).`,
    channels: ['phone', 'sms'],
    locked: true,
    supersedesId: null,
    createdAt: '2026-09-01T00:00:00Z',
    createdByUserId: hexId('usr', 1),
    ...overrides,
  }
}

/** A Suppression entry as core returns it. */
export function suppressionBody(
  n: number,
  overrides: Partial<{
    addressKind: string
    maskedAddress: string | null
    reason: string
    removable: boolean
    removedAt: string | null
    removalReason: string | null
  }> = {}
) {
  return {
    id: hexId('sup', n),
    addressKind: 'email',
    maskedAddress: `p***${n}@example.com`,
    reason: 'manual',
    channel: null,
    sourceRef: null,
    addedByUserId: hexId('usr', 1),
    removable: true,
    createdAt: '2026-10-05T09:00:00Z',
    removedAt: null,
    removedByUserId: overrides.removedAt ? hexId('usr', 2) : null,
    removalReason: overrides.removedAt ? 'Added by mistake' : null,
    ...overrides,
  }
}

/** An API key as core returns it (no secret): active, never used, expiring in 90 days, unless overridden. */
export function apiKeyBody(
  n: number,
  overrides: Partial<{
    name: string
    scopes: string[]
    roleCeiling: 'owner' | 'admin' | 'manager' | 'rep'
    expiresAt: string | null
    lastUsedAt: string | null
    revokedAt: string | null
  }> = {}
) {
  return {
    id: hexId('akey', n),
    name: `Key ${n}`,
    prefix: `clk_${String(n).padStart(8, 'a')}`,
    scopes: ['prospects:read'],
    roleCeiling: 'rep',
    expiresAt: '2099-01-01T00:00:00Z',
    lastUsedAt: null,
    revokedAt: null,
    createdAt: '2026-10-01T00:00:00Z',
    createdByMembershipId: hexId('mem', 1),
    ...overrides,
  }
}
