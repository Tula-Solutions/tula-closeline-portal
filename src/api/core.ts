import {
  type CreateProspectCompanyRequest,
  type CreateProspectRequest,
  createProspectCompanyRequestSchema,
  createProspectRequestSchema,
  IDEMPOTENCY_KEY_HEADER,
  type InvitableRole,
  type Invitation,
  invitationSchema,
  type ListInvitationsResponse,
  type ListMembersResponse,
  type ListProspectCompaniesResponse,
  type ListProspectsResponse,
  type ListTeamsResponse,
  listInvitationsResponseSchema,
  listMembersResponseSchema,
  listProspectCompaniesResponseSchema,
  listProspectsResponseSchema,
  listTeamsResponseSchema,
  type Member,
  memberSchema,
  type Organization,
  organizationSchema,
  type Prospect,
  type ProspectCompany,
  prospectCompanySchema,
  prospectSchema,
  type Role,
  type Team,
  type TeamMember,
  teamMemberSchema,
  teamSchema,
  type UpdateProspectRequest,
  updateProspectRequestSchema,
} from 'tula-closeline-contract'
import type { HttpClient } from '~/api/http'

/** The page size every list asks for; the server allows up to 100. */
export const PAGE_SIZE = 25

/** One page request: the cursor the previous page returned (none for the first), and a page size other than `PAGE_SIZE` when one is wanted. */
export type PageRequest = {
  readonly cursor?: string | undefined
  readonly limit?: number | undefined
  readonly signal?: AbortSignal
}

/** What a page of Prospects may be narrowed by; each is sent only when set. */
export type ProspectFilter = {
  readonly q?: string | undefined
  readonly status?: 'active' | 'archived' | undefined
  readonly source?: string | undefined
  readonly ownerMembershipId?: string | undefined
  readonly companyId?: string | undefined
}

/** The core service routes the portal uses. */
export type CoreApi = {
  /** Reads the caller's Organization (a read, so it is retried). */
  getOrganization(signal?: AbortSignal): Promise<Organization>
  /** One page of members (Owner, Admin, Manager). */
  listMembers(page: PageRequest): Promise<ListMembersResponse>
  /** Changes a member's role (Owner: any; Admin: Manager and Rep only). */
  changeMemberRole(membershipId: string, role: Role): Promise<Member>
  /** Removes a member from the Organization. */
  removeMember(membershipId: string): Promise<void>
  /** One page of pending Invitations (Owner, Admin). */
  listInvitations(page: PageRequest): Promise<ListInvitationsResponse>
  /** Sends an Invitation; the key makes a repeat of the same request send nothing twice. */
  createInvitation(
    body: { readonly email: string; readonly role: InvitableRole },
    idempotencyKey: string
  ): Promise<Invitation>
  /** Revokes a pending Invitation. */
  revokeInvitation(invitationId: string): Promise<void>
  /** One page of Teams (any role). */
  listTeams(page: PageRequest): Promise<ListTeamsResponse>
  /** Creates a Team; the key makes a repeat of the same request create it once. */
  createTeam(body: { readonly name: string }, idempotencyKey: string): Promise<Team>
  /** Renames a Team. */
  renameTeam(teamId: string, name: string): Promise<Team>
  /** Deletes a Team; its members stay members of the Organization. */
  deleteTeam(teamId: string): Promise<void>
  /** Adds a member to a Team (adding one already in it succeeds). */
  addTeamMember(teamId: string, membershipId: string, idempotencyKey: string): Promise<TeamMember>
  /** Removes a member from a Team; the key makes a repeat of the same request answer as the first did, and core refuses a member who is not in the Team as a missing member. */
  removeTeamMember(teamId: string, membershipId: string, idempotencyKey: string): Promise<void>
  /** One page of the Prospects the caller may see (core decides by role), newest first, or in id order when `q` is set; a page may be short, even empty, while a cursor is present. */
  listProspects(page: PageRequest & ProspectFilter): Promise<ListProspectsResponse>
  /** One Prospect with the Source and time of each field. */
  getProspect(prospectId: string, signal?: AbortSignal): Promise<Prospect>
  /** Creates a Prospect by hand; the key makes a repeat of the same request create it once. */
  createProspect(body: CreateProspectRequest, idempotencyKey: string): Promise<Prospect>
  /** Changes a Prospect; only the fields in the body change, and null clears one. */
  updateProspect(prospectId: string, body: UpdateProspectRequest): Promise<Prospect>
  /** One page of Prospect Companies, optionally narrowed by a name search. */
  listProspectCompanies(
    page: PageRequest & { readonly q?: string | undefined }
  ): Promise<ListProspectCompaniesResponse>
  /** One Prospect Company. */
  getProspectCompany(companyId: string, signal?: AbortSignal): Promise<ProspectCompany>
  /** Creates a Prospect Company; the key makes a repeat of the same request create it once. */
  createProspectCompany(
    body: CreateProspectCompanyRequest,
    idempotencyKey: string
  ): Promise<ProspectCompany>
}

const segment = encodeURIComponent

/** Builds the core routes over an HTTP client for same-origin paths, which sends the access token. */
export function createCoreApi(http: HttpClient): CoreApi {
  const query = (page: PageRequest) => ({ cursor: page.cursor, limit: page.limit ?? PAGE_SIZE })
  return {
    getOrganization: (signal) =>
      http.request<Organization>({
        path: '/v1/organization',
        auth: true,
        signal,
        parse: (json) => organizationSchema.parse(json),
      }),
    listMembers: (page) =>
      http.request({
        path: '/v1/members',
        query: query(page),
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => listMembersResponseSchema.parse(json),
      }),
    changeMemberRole: (membershipId, role) =>
      http.request({
        method: 'PATCH',
        path: `/v1/members/${segment(membershipId)}`,
        body: { role },
        auth: true,
        parse: (json) => memberSchema.parse(json),
      }),
    removeMember: (membershipId) =>
      http.request<void>({
        method: 'DELETE',
        path: `/v1/members/${segment(membershipId)}`,
        auth: true,
      }),
    listInvitations: (page) =>
      http.request({
        path: '/v1/invitations',
        query: { ...query(page), state: 'pending' },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => listInvitationsResponseSchema.parse(json),
      }),
    createInvitation: (body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: '/v1/invitations',
        body,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => invitationSchema.parse(json),
      }),
    revokeInvitation: (invitationId) =>
      http.request<void>({
        method: 'DELETE',
        path: `/v1/invitations/${segment(invitationId)}`,
        auth: true,
      }),
    listTeams: (page) =>
      http.request({
        path: '/v1/teams',
        query: query(page),
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => listTeamsResponseSchema.parse(json),
      }),
    createTeam: (body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: '/v1/teams',
        body,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => teamSchema.parse(json),
      }),
    renameTeam: (teamId, name) =>
      http.request({
        method: 'PATCH',
        path: `/v1/teams/${segment(teamId)}`,
        body: { name },
        auth: true,
        parse: (json) => teamSchema.parse(json),
      }),
    deleteTeam: (teamId) =>
      http.request<void>({
        method: 'DELETE',
        path: `/v1/teams/${segment(teamId)}`,
        auth: true,
      }),
    addTeamMember: (teamId, membershipId, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: `/v1/teams/${segment(teamId)}/members`,
        body: { membershipId },
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => teamMemberSchema.parse(json),
      }),
    removeTeamMember: (teamId, membershipId, idempotencyKey) =>
      http.request<void>({
        method: 'DELETE',
        path: `/v1/teams/${segment(teamId)}/members/${segment(membershipId)}`,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
      }),
    listProspects: (page) =>
      http.request({
        path: '/v1/prospects',
        query: {
          ...query(page),
          q: page.q,
          status: page.status,
          source: page.source,
          ownerMembershipId: page.ownerMembershipId,
          companyId: page.companyId,
        },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => listProspectsResponseSchema.parse(json),
      }),
    getProspect: (prospectId, signal) =>
      http.request({
        path: `/v1/prospects/${segment(prospectId)}`,
        auth: true,
        signal,
        parse: (json) => prospectSchema.parse(json),
      }),
    createProspect: (body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: '/v1/prospects',
        body: createProspectRequestSchema.parse(body),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => prospectSchema.parse(json),
      }),
    updateProspect: (prospectId, body) =>
      http.request({
        method: 'PATCH',
        path: `/v1/prospects/${segment(prospectId)}`,
        body: updateProspectRequestSchema.parse(body),
        auth: true,
        parse: (json) => prospectSchema.parse(json),
      }),
    listProspectCompanies: (page) =>
      http.request({
        path: '/v1/prospect-companies',
        query: { ...query(page), q: page.q },
        auth: true,
        ...(page.signal ? { signal: page.signal } : {}),
        parse: (json) => listProspectCompaniesResponseSchema.parse(json),
      }),
    getProspectCompany: (companyId, signal) =>
      http.request({
        path: `/v1/prospect-companies/${segment(companyId)}`,
        auth: true,
        signal,
        parse: (json) => prospectCompanySchema.parse(json),
      }),
    createProspectCompany: (body, idempotencyKey) =>
      http.request({
        method: 'POST',
        path: '/v1/prospect-companies',
        body: createProspectCompanyRequestSchema.parse(body),
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        auth: true,
        parse: (json) => prospectCompanySchema.parse(json),
      }),
  }
}
