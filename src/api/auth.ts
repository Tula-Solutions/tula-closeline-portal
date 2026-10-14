import {
  type AuthOptionsResponse,
  authOptionsResponseSchema,
  type GoogleCompleteRequest,
  type GoogleStartRequest,
  googleCompleteResponseSchema,
  googleStartResponseSchema,
} from 'tula-closeline-contract'
import type { components } from '~/api/auth.gen'
import { CLIENT_ERRORS, clientError } from '~/api/errors'
import type { HttpClient } from '~/api/http'

/** The answer of every step of a sign-up or sign-in. */
export type FlowResponse = components['schemas']['BrowserFlowResponse']
/** A session as the auth service hands it to the browser: the access token, its expiry and the Organization. The refresh token is a cookie script cannot read. */
export type SessionTokens = components['schemas']['BrowserSessionTokens']
/** What a person types to start a sign-up; exactly one of `organizationName` and `invitationToken`. */
export type SignUpDetails = components['schemas']['SignUpRequest']
/** The password length limits. */
export type PasswordPolicy = components['schemas']['PasswordPolicy']

/** The auth service routes the portal uses, typed from its OpenAPI document. */
export type AuthApi = {
  /** Starts a sign-up and emails a code. */
  startSignUp(details: SignUpDetails, signal?: AbortSignal): Promise<FlowResponse>
  /** Spends the emailed code; the answer carries the session once the account exists. */
  verifySignUp(
    attempt: { id: string; secret: string },
    code: string,
    signal?: AbortSignal
  ): Promise<FlowResponse>
  /** Emails a new code for the attempt. */
  resendSignUpCode(
    attempt: { id: string; secret: string },
    signal?: AbortSignal
  ): Promise<FlowResponse>
  /** Starts a sign-in for an email address. */
  startSignIn(email: string, signal?: AbortSignal): Promise<FlowResponse>
  /** Sends the password; the answer carries the session. */
  submitPassword(
    attempt: { id: string; secret: string },
    password: string,
    signal?: AbortSignal
  ): Promise<FlowResponse>
  /** Renews the session from the refresh cookie the browser sends on its own. */
  refresh(signal?: AbortSignal): Promise<SessionTokens>
  /** Ends the session the refresh cookie belongs to; the service clears the cookie. */
  signOut(signal?: AbortSignal): Promise<void>
  /** Which sign-in providers are on (a read). Any failure means "none": the caller hides the button. */
  authOptions(signal?: AbortSignal): Promise<AuthOptionsResponse>
  /** Starts a Sign in with Google; the answer is the Google address to send the browser to (the attempt secret is a cookie). */
  startGoogle(request: GoogleStartRequest, signal?: AbortSignal): Promise<string>
  /** Finishes a Google sign-up with an Organization name or an Invitation; the answer carries the session. */
  completeGoogle(request: GoogleCompleteRequest, signal?: AbortSignal): Promise<FlowResponse>
  /** Reads the password length limits (a read, so it is retried). */
  passwordPolicy(signal?: AbortSignal): Promise<PasswordPolicy>
}

const ATTEMPT_HEADER = 'x-tula-attempt'

/** The client type every call to auth declares: it makes auth keep the refresh token in a cookie. */
export const CLIENT_TYPE_HEADER = { 'x-tula-client': 'browser' } as const

/** Builds the auth routes over an HTTP client whose headers carry `x-tula-client: browser`; paths are same-origin. */
export function createAuthApi(http: HttpClient): AuthApi {
  const flowPath = (kind: 'sign-ups' | 'sign-ins', id: string, step: string) =>
    `/v1/client/${kind}/${encodeURIComponent(id)}/${step}`
  return {
    startSignUp: (details, signal) =>
      http.request<FlowResponse>({
        method: 'POST',
        path: '/v1/client/sign-ups',
        body: details,
        signal,
      }),
    verifySignUp: (attempt, code, signal) =>
      http.request<FlowResponse>({
        method: 'POST',
        path: flowPath('sign-ups', attempt.id, 'verify-email'),
        headers: { [ATTEMPT_HEADER]: attempt.secret },
        body: { code },
        signal,
      }),
    resendSignUpCode: (attempt, signal) =>
      http.request<FlowResponse>({
        method: 'POST',
        path: flowPath('sign-ups', attempt.id, 'resend-code'),
        headers: { [ATTEMPT_HEADER]: attempt.secret },
        signal,
      }),
    startSignIn: (email, signal) =>
      http.request<FlowResponse>({
        method: 'POST',
        path: '/v1/client/sign-ins',
        body: { identifier: email },
        signal,
      }),
    submitPassword: (attempt, password, signal) =>
      http.request<FlowResponse>({
        method: 'POST',
        path: flowPath('sign-ins', attempt.id, 'password'),
        headers: { [ATTEMPT_HEADER]: attempt.secret },
        body: { password },
        signal,
      }),
    refresh: (signal) =>
      http.request<SessionTokens>({
        method: 'POST',
        path: '/v1/client/sessions/refresh',
        signal,
      }),
    signOut: (signal) =>
      http.request<void>({ method: 'POST', path: '/v1/client/sessions/sign-out', signal }),
    authOptions: async (signal) => {
      const body = await http.request<unknown>({ path: '/v1/client/auth-options', signal })
      const parsed = authOptionsResponseSchema.safeParse(body)
      if (!parsed.success) {
        throw clientError(CLIENT_ERRORS.badResponse, 200)
      }
      return parsed.data
    },
    startGoogle: async (request, signal) => {
      const body = await http.request<unknown>({
        method: 'POST',
        path: '/v1/client/google/start',
        body: request,
        signal,
      })
      const parsed = googleStartResponseSchema.safeParse(body)
      if (!parsed.success) {
        throw clientError(CLIENT_ERRORS.badResponse, 200)
      }
      return parsed.data.authorizationUrl
    },
    completeGoogle: async (request, signal) => {
      const body = await http.request<unknown>({
        method: 'POST',
        path: '/v1/client/google/complete',
        body: request,
        signal,
      })
      const parsed = googleCompleteResponseSchema.safeParse(body)
      if (!parsed.success) {
        throw clientError(CLIENT_ERRORS.badResponse, 200)
      }
      return parsed.data
    },
    passwordPolicy: (signal) =>
      http.request<PasswordPolicy>({ path: '/v1/client/password-policy', signal }),
  }
}
