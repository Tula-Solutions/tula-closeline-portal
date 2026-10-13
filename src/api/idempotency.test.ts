import { describe, expect, test } from 'bun:test'
import { ApiError, CLIENT_ERRORS, clientError } from '~/api/errors'
import { createKeyHolder, dropInvitationKeys, fingerprint } from '~/api/idempotency'

function counting(max?: number) {
  let n = 0
  return createKeyHolder(() => {
    n += 1
    return `test-key-number-${n}`
  }, max)
}

describe('the idempotency key holder', () => {
  test('the same intent asked for twice gets the same key', () => {
    const keys = counting()
    expect(keys.begin('a').key).toBe(keys.begin('a').key)
  })

  test('a different intent gets a different key, so the server never sees one key with two bodies', () => {
    const keys = counting()
    expect(keys.begin('a').key).not.toBe(keys.begin('b').key)
  })

  test('after a success the next one gets a new key', () => {
    const keys = counting()
    const first = keys.begin('a')
    first.succeeded()
    expect(keys.begin('a').key).not.toBe(first.key)
  })

  test.each([
    ['a timeout', clientError(CLIENT_ERRORS.timeout), true],
    ['no network', clientError(CLIENT_ERRORS.network), true],
    ['an answer it could not read', clientError(CLIENT_ERRORS.badResponse, 201), true],
    ['a 503', new ApiError({ code: 'server.unavailable', status: 503 }), true],
    [
      'the first try still running',
      new ApiError({ code: 'request.idempotency_in_progress', status: 409 }),
      true,
    ],
    ['a validation refusal', new ApiError({ code: 'request.invalid', status: 400 }), false],
    ['a taken name', new ApiError({ code: 'team.name_taken', status: 409 }), false],
    ['a 403', new ApiError({ code: 'auth.forbidden', status: 403 }), false],
  ])('after %s the key is kept: %s', (_name, error, kept) => {
    const keys = counting()
    const first = keys.begin('a')
    first.failed(error)
    expect(keys.begin('a').key === first.key).toBe(kept)
  })

  test('the generated key is one the contract accepts', () => {
    expect(createKeyHolder().begin('a').key).toMatch(/^[A-Za-z0-9_.:-]{16,128}$/)
  })

  test('add the same member to two Teams: different keys', () => {
    const keys = counting()
    const x = keys.begin(fingerprint.teamMember('team_x', 'mem_m'))
    x.failed(clientError(CLIENT_ERRORS.network))
    const y = keys.begin(fingerprint.teamMember('team_y', 'mem_m'))
    expect(y.key).not.toBe(x.key)
    expect(keys.begin(fingerprint.teamMember('team_x', 'mem_m')).key).toBe(x.key)
  })

  test('invite A times out, another address is revoked, invite B is sent: A keeps its key', () => {
    const keys = counting()
    const a = keys.begin(fingerprint.invitation('a@n.app', 'rep'))
    a.failed(clientError(CLIENT_ERRORS.timeout))
    dropInvitationKeys(keys, 'other@n.app')
    const b = keys.begin(fingerprint.invitation('b@n.app', 'rep'))
    b.succeeded()
    expect(keys.begin(fingerprint.invitation('a@n.app', 'rep')).key).toBe(a.key)
  })

  test('revoking an address drops its key for every role, and only its own', () => {
    const keys = counting()
    const rep = keys.begin(fingerprint.invitation('a@n.app', 'rep'))
    const admin = keys.begin(fingerprint.invitation('a@n.app', 'admin'))
    const other = keys.begin(fingerprint.invitation('z@n.app', 'rep'))
    dropInvitationKeys(keys, 'a@n.app')
    expect(keys.begin(fingerprint.invitation('a@n.app', 'rep')).key).not.toBe(rep.key)
    expect(keys.begin(fingerprint.invitation('a@n.app', 'admin')).key).not.toBe(admin.key)
    expect(keys.begin(fingerprint.invitation('z@n.app', 'rep')).key).toBe(other.key)
  })

  test('drop forgets only the named intent', () => {
    const keys = counting()
    const a = keys.begin('a')
    const b = keys.begin('b')
    keys.drop('a')
    expect(keys.begin('a').key).not.toBe(a.key)
    expect(keys.begin('b').key).toBe(b.key)
  })

  test('the bound drops the least recently used key and the map never grows past it', () => {
    const keys = counting(3)
    const first = keys.begin('1')
    keys.begin('2')
    keys.begin('3')
    keys.begin('1') // 1 is now the most recent; 2 is the oldest
    const second = keys.begin('2')
    keys.begin('4')
    keys.begin('5')
    expect(keys.size()).toBe(3)
    expect(keys.begin('1').key).not.toBe(first.key)
    expect(second.key).toBeDefined()
  })

  test('the bound is 32 by default', () => {
    const keys = createKeyHolder()
    for (let i = 0; i < 100; i += 1) {
      keys.begin(`intent-${i}`)
    }
    expect(keys.size()).toBe(32)
  })

  test('a try that began before a clear cannot touch the keys of the new Organization', () => {
    const keys = counting()
    const inA = keys.begin('write-a')
    keys.clear()
    const inB = keys.begin('write-b')
    inB.failed(clientError(CLIENT_ERRORS.timeout))
    // A's write ends 401 later.
    inA.failed(new ApiError({ code: 'auth.unauthenticated', status: 401 }))
    inA.succeeded()
    expect(keys.begin('write-b').key).toBe(inB.key)
    expect(keys.size()).toBe(1)
  })
})
