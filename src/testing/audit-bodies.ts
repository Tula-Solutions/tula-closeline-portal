import { hexId } from '~/testing/core-bodies'

/** An id in the contract's shape for the audit and export ids, made from a number. */
function id(prefix: 'aud' | 'exp', n: number): string {
  return `${prefix}_${n.toString(16).padStart(32, '0')}`
}

type Actor =
  | { kind: 'member'; membershipId: string }
  | { kind: 'agent'; agentKind: 'inbound' | 'outbound' }
  | { kind: 'api_key'; apiKeyId: string }
  | { kind: 'system' }

/** An audit event as core returns it: a member changed a Prospect, with ids and labels only. */
export function auditEventBody(
  n: number,
  overrides: Partial<{
    actor: Actor
    action: string
    subject: { type: string; id: string } | null
    prospectId: string | null
    instructionVersion: number | null
    requestId: string | null
    metadata: Record<string, string | number | boolean | null>
    occurredAt: string
  }> = {}
) {
  return {
    id: id('aud', n),
    sequence: n,
    occurredAt: '2026-10-05T10:00:00Z',
    actor: { kind: 'member', membershipId: hexId('mem', 1) },
    action: 'prospect.updated',
    subject: { type: 'prospect', id: hexId('prs', n) },
    prospectId: hexId('prs', n),
    instructionVersion: null,
    requestId: null,
    metadata: { field: 'status' },
    previousHash: n.toString(16).padStart(64, '0'),
    hash: (n + 1).toString(16).padStart(64, '0'),
    ...overrides,
  }
}

type PartState = 'pending' | 'ready' | 'failed'

/** One service's slice of an export. */
export function exportPartBody(
  service: 'core' | 'playbook' | 'voice' | 'outbound',
  state: PartState,
  overrides: Partial<{
    fileCount: number | null
    bytes: number | null
    readyAt: string | null
  }> = {}
) {
  const done = state === 'ready'
  return {
    service,
    state,
    fileCount: done ? 3 : null,
    bytes: done ? 2048 : null,
    readyAt: done ? '2026-10-05T10:05:00Z' : null,
    ...overrides,
  }
}

/** An export job as core returns it; by default a ready one asked for at 10:00 and done at 10:06. */
export function exportJobBody(
  n: number,
  overrides: Partial<{
    state: 'queued' | 'running' | 'ready' | 'failed' | 'expired'
    includeRecordingLinks: boolean
    parts: ReturnType<typeof exportPartBody>[]
    failureReason: 'part_failed' | 'timed_out' | 'storage_unavailable' | null
    requestedAt: string
    completedAt: string | null
    expiresAt: string | null
  }> = {}
) {
  return {
    id: id('exp', n),
    kind: 'organization',
    format: null,
    filter: null,
    state: 'ready',
    requestedByMembershipId: hexId('mem', 1),
    includeRecordingLinks: false,
    parts: [
      exportPartBody('core', 'ready'),
      exportPartBody('playbook', 'ready'),
      exportPartBody('voice', 'ready'),
    ],
    failureReason: null,
    requestedAt: '2026-10-05T10:00:00Z',
    completedAt: '2026-10-05T10:06:00Z',
    expiresAt: '2099-10-12T10:06:00Z',
    ...overrides,
  }
}
