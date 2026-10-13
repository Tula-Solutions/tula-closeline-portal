import type { components } from '~/api/auth.gen'
import type { HttpClient } from '~/api/http'

/** The answer of every step of a sign-up or sign-in. */
export type FlowResponse = components['schemas']['FlowResponse']
/** A session as the auth service hands it over: both tokens, the expiry and the Organization. */
export type SessionTokens = components['schemas']['SessionTokens']
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
  /** Trades a refresh token for new tokens. */
  refresh(refreshToken: string, signal?: AbortSignal): Promise<SessionTokens>
  /** Ends the session of a refresh token. */
  signOut(refreshToken: string, signal?: AbortSignal): Promise<void>
  /** Reads the password length limits (a read, so it is retried). */
  passwordPolicy(signal?: AbortSignal): Promise<PasswordPolicy>
}

const ATTEMPT_HEADER = 'x-tula-attempt'

/** Builds the auth routes over an HTTP client whose base URL is the auth service and whose headers carry `x-tula-client: web`. */
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
    refresh: (refreshToken, signal) =>
      http.request<SessionTokens>({
        method: 'POST',
        path: '/v1/client/sessions/refresh',
        body: { refreshToken },
        signal,
      }),
    signOut: (refreshToken, signal) =>
      http.request<void>({
        method: 'POST',
        path: '/v1/client/sessions/sign-out',
        body: { refreshToken },
        signal,
      }),
    passwordPolicy: (signal) =>
      http.request<PasswordPolicy>({ path: '/v1/client/password-policy', signal }),
  }
}
