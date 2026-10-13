import {
  INVITABLE_ROLES,
  type InvitableRole,
  type Role,
  roleAtLeast,
} from 'tula-closeline-contract'

/** The plain word for each role. */
export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  rep: 'Rep',
}

/**
 * What the signed-in role may do, as core's spec says. A convenience for the screens only: core is
 * the authority and a 403 from it is always handled.
 */
export const can = {
  /** Owner, Admin and Manager list members. */
  viewMembers: (role: Role) => roleAtLeast(role, 'manager'),
  /** Owner and Admin change roles and remove members (within the limits of `assignableRoles`). */
  manageMembers: (role: Role) => roleAtLeast(role, 'admin'),
  /** Owner and Admin list, send and revoke Invitations. */
  manageInvitations: (role: Role) => roleAtLeast(role, 'admin'),
  /** Owner and Admin create, rename and delete Teams and change who is in them. */
  manageTeams: (role: Role) => roleAtLeast(role, 'admin'),
}

/** The roles an Invitation may offer: an Owner offers Admin, Manager or Rep; an Admin Manager or Rep. */
export function invitableRoles(role: Role): readonly InvitableRole[] {
  if (role === 'owner') {
    return INVITABLE_ROLES
  }
  return role === 'admin' ? INVITABLE_ROLES.filter((offered) => offered !== 'admin') : []
}

/** Whether the signed-in role may revoke an Invitation offering `offered`. */
export function canRevokeInvitation(role: Role, offered: InvitableRole): boolean {
  return invitableRoles(role).includes(offered)
}

/** The roles the signed-in role may give `target` (an Owner: any; an Admin: Manager or Rep, for a Manager or Rep). */
export function assignableRoles(role: Role, target: Role): readonly Role[] {
  if (role === 'owner') {
    return ['owner', 'admin', 'manager', 'rep']
  }
  if (role === 'admin' && (target === 'manager' || target === 'rep')) {
    return ['manager', 'rep']
  }
  return []
}

/** Whether the signed-in role may remove a member holding `target` (an Owner: any; an Admin: Manager or Rep). */
export function canRemoveMember(role: Role, target: Role): boolean {
  return assignableRoles(role, target).length > 0
}
