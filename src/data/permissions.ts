import {
  AGENT_CONTROL_ADMIN_ROLES,
  AGENT_CONTROL_READ_ROLES,
  ANALYTICS_ADMIN_ROLES,
  ANALYTICS_READ_ROLES,
  APIKEY_ADMIN_ROLES,
  ASSESSMENT_ADMIN_ROLES,
  AUDIT_ADMIN_ROLES,
  AUDIT_READ_ROLES,
  BOOKING_ADMIN_ROLES,
  CONSENT_ADMIN_ROLES,
  EXPORT_ROLES,
  INBOX_ADMIN_ROLES,
  INBOX_REVIEW_ROLES,
  INVITABLE_ROLES,
  type InvitableRole,
  type Role,
  roleAtLeast,
  SEARCH_ROUTES,
  VOICE_ADMIN_ROLES,
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
  /** Owner and Admin may name another member as a Prospect's owner; a Rep or Manager owns what they add. */
  assignProspectOwner: (role: Role) => roleAtLeast(role, 'admin'),
  /** Owner and Admin list, send and revoke Invitations. */
  manageInvitations: (role: Role) => roleAtLeast(role, 'admin'),
  /** Owner and Admin create, rename and delete Teams and change who is in them. */
  manageTeams: (role: Role) => roleAtLeast(role, 'admin'),
  /** The roles the contract gives the Line routes (Owner and Admin) add, assign and release Lines. */
  manageLines: (role: Role) => VOICE_ADMIN_ROLES.some((allowed) => allowed === role),
  /** Owner and Admin define, change and retire Booking Types. */
  manageBookingTypes: (role: Role) => BOOKING_ADMIN_ROLES.some((allowed) => allowed === role),
  /** Owner and Admin set which Drafts go out without a person (the approval policy). */
  manageApprovalPolicy: (role: Role) => INBOX_ADMIN_ROLES.some((allowed) => allowed === role),
  /** Owner and Admin set where a Conversation that needs a person goes (the escalation rules). */
  manageEscalationRules: (role: Role) => INBOX_ADMIN_ROLES.some((allowed) => allowed === role),
  /** Owner, Admin and Manager read the decisions made about Drafts. */
  viewDecisions: (role: Role) => INBOX_REVIEW_ROLES.some((allowed) => allowed === role),
  /** Creating, listing and revoking API keys. */
  manageApiKeys: (role: Role) => APIKEY_ADMIN_ROLES.some((allowed) => allowed === role),
  /** The roles the contract gives the analytics read routes (every role) open the dashboards, each within its own scope. */
  viewAnalytics: (role: Role) => ANALYTICS_READ_ROLES.some((allowed) => allowed === role),
  /** Owner and Admin (the contract's analytics admin roles) compare Campaigns and break numbers down by Channel or Agent; a Manager or Rep core refuses with auth.forbidden. */
  compareCampaigns: (role: Role) => ANALYTICS_ADMIN_ROLES.some((allowed) => allowed === role),
  /** Attribution and source performance are Owner and Admin only (the contract's analytics admin roles); core refuses a Manager or Rep with auth.forbidden. */
  viewAttribution: (role: Role) => ANALYTICS_ADMIN_ROLES.some((allowed) => allowed === role),
  /** The roles the contract gives the assessment review (Owner and Admin) read flagged Agent output and mark findings; a Manager or Rep never reaches it. */
  reviewAssessments: (role: Role) => ASSESSMENT_ADMIN_ROLES.some((allowed) => allowed === role),
  /** Owner, Admin and Manager see one row per Rep; a Rep sees only their own row. */
  compareReps: (role: Role) => roleAtLeast(role, 'manager'),
  /** The roles the contract gives the audit read routes (Owner, Admin, Manager) see the audit log; a Manager sees only events about their Team's Prospects. */
  viewAudit: (role: Role) => AUDIT_READ_ROLES.some((allowed) => allowed === role),
  /** The roles the contract gives the audit CSV and verification routes (Owner, Admin). */
  manageAudit: (role: Role) => AUDIT_ADMIN_ROLES.some((allowed) => allowed === role),
  /** The roles the contract gives the export routes (Owner, Admin) request and download an export. */
  manageExports: (role: Role) => EXPORT_ROLES.some((allowed) => allowed === role),
  /** The roles the contract gives the Suppression routes (Owner and Admin) list, add and remove entries. */
  manageSuppression: (role: Role) => CONSENT_ADMIN_ROLES.some((allowed) => allowed === role),
  /** The roles the contract gives the Consent Wording write routes (Owner and Admin); every role reads them. */
  manageConsentWording: (role: Role) => CONSENT_ADMIN_ROLES.some((allowed) => allowed === role),
  /** The roles the contract gives the Agent read routes (Owner, Admin, Manager) read the published instructions and controls. */
  viewAgent: (role: Role) => AGENT_CONTROL_READ_ROLES.some((allowed) => allowed === role),
  /** The roles the contract gives the Agent write routes (Owner and Admin) edit instructions, controls and the pause switch. */
  manageAgent: (role: Role) => AGENT_CONTROL_ADMIN_ROLES.some((allowed) => allowed === role),
  /** Owner and Admin upload, delete and restore Playbook documents; every role reads them. */
  managePlaybook: (role: Role) => roleAtLeast(role, 'admin'),
  /** Owner and Admin see and manage sales history (Deals, imports, Calls, the rights confirmation); Manager and Rep never reach it. */
  manageSalesHistory: (role: Role) => roleAtLeast(role, 'admin'),
  /** Owner and Admin import Prospects from a CSV and read the reports; core refuses Manager and Rep. */
  importProspects: (role: Role) => roleAtLeast(role, 'admin'),
  /** The roles the contract gives the search route (Owner and Admin) search the Moments of won Deals. */
  searchWonDeals: (role: Role) => SEARCH_ROUTES.searchMoments.roles.includes(role),
  /** The roles the contract gives the Document search route (every role) search the Playbook's Documents. */
  searchDocuments: (role: Role) => SEARCH_ROUTES.searchDocuments.roles.includes(role),
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
