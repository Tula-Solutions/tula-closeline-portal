import { describe, expect, test } from 'bun:test'
import type { Role } from 'tula-closeline-contract'
import {
  assignableRoles,
  can,
  canRemoveMember,
  canRevokeInvitation,
  invitableRoles,
} from '~/data/permissions'

describe('role gates, as core serves them', () => {
  test.each<[Role, boolean, boolean, boolean]>([
    ['owner', true, true, true],
    ['admin', true, true, true],
    ['manager', true, false, false],
    ['rep', false, false, false],
  ])('%s: members %p, invitations %p, teams %p', (role, members, invitations, teams) => {
    expect(can.viewMembers(role)).toBe(members)
    expect(can.manageInvitations(role)).toBe(invitations)
    expect(can.manageTeams(role)).toBe(teams)
  })

  test.each<[Role, string[]]>([
    ['owner', ['admin', 'manager', 'rep']],
    ['admin', ['manager', 'rep']],
    ['manager', []],
    ['rep', []],
  ])('%s may offer %j', (role, offered) => {
    expect([...invitableRoles(role)] as string[]).toEqual(offered)
  })

  test.each<[Role, Role, string[]]>([
    ['owner', 'owner', ['owner', 'admin', 'manager', 'rep']],
    ['owner', 'rep', ['owner', 'admin', 'manager', 'rep']],
    ['admin', 'rep', ['manager', 'rep']],
    ['admin', 'manager', ['manager', 'rep']],
    ['admin', 'admin', []],
    ['admin', 'owner', []],
    ['manager', 'rep', []],
    ['rep', 'rep', []],
  ])('%s changing a %s may choose %j', (viewer, target, roles) => {
    expect([...assignableRoles(viewer, target)] as string[]).toEqual(roles)
    expect(canRemoveMember(viewer, target)).toBe(roles.length > 0)
  })

  test('an Admin revokes only Invitations offering Manager or Rep', () => {
    expect(canRevokeInvitation('admin', 'rep')).toBe(true)
    expect(canRevokeInvitation('admin', 'admin')).toBe(false)
    expect(canRevokeInvitation('owner', 'admin')).toBe(true)
    expect(canRevokeInvitation('manager', 'rep')).toBe(false)
  })
})
