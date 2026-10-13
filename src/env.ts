import { z } from 'zod'

/** The deployment environments. Behaviour is gated on this, never on Vite's mode. */
export const ENVIRONMENTS = ['local', 'dev', 'staging', 'prod'] as const

/** One of the deployment environments. */
export type Environment = (typeof ENVIRONMENTS)[number]

const optionalString = z
  .string('must be text')
  .trim()
  .transform((value) => (value === '' ? undefined : value))
  .optional()

const dsnSchema = optionalString.refine((value) => {
  if (value === undefined) {
    return true
  }
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.username !== '' && url.pathname.length > 1
  } catch {
    return false
  }
}, 'must be a Sentry DSN such as https://<key>@<host>/<project>')

const envSchema = z
  .object({
    VITE_ENVIRONMENT: z.enum(ENVIRONMENTS, `must be one of ${ENVIRONMENTS.join(', ')}`),
    VITE_SENTRY_DSN: dsnSchema,
    VITE_RELEASE: optionalString,
  })
  .superRefine((value, ctx) => {
    if (value.VITE_ENVIRONMENT !== 'local' && value.VITE_SENTRY_DSN === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['VITE_SENTRY_DSN'],
        message: 'is required outside the local environment',
      })
    }
  })

/** The portal's configuration, parsed once at boot. */
export type Env = {
  readonly environment: Environment
  readonly sentryDsn: string | undefined
  readonly release: string | undefined
}

/** Thrown at boot when the `VITE_*` variables are missing or malformed; the message names each one. */
export class EnvError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid configuration:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
    this.name = 'EnvError'
  }
}

/** Parses the raw `VITE_*` variables into the portal's configuration, or throws an EnvError. */
export function parseEnv(raw: Readonly<Record<string, unknown>>): Env {
  const result = envSchema.safeParse(raw)
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map(
        (issue) => `${issue.path.join('.') || 'configuration'} ${issue.message}`
      )
    )
  }
  const value = result.data
  return {
    environment: value.VITE_ENVIRONMENT,
    sentryDsn: value.VITE_SENTRY_DSN,
    release: value.VITE_RELEASE,
  }
}

/** The origin (scheme, host and port) of a URL, as a Content-Security-Policy source. */
export function originOf(url: string): string {
  return new URL(url).origin
}
