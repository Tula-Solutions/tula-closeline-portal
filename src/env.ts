import { z } from 'zod'

/** The deployment environments. Behaviour is gated on this, never on Vite's mode. */
export const ENVIRONMENTS = ['local', 'dev', 'staging', 'prod'] as const

/** One of the deployment environments. */
export type Environment = (typeof ENVIRONMENTS)[number]

const baseUrlSchema = z
  .string('is required')
  .trim()
  .min(1, 'is required')
  .refine((value) => {
    try {
      const url = new URL(value)
      return (url.protocol === 'https:' || url.protocol === 'http:') && !url.search && !url.hash
    } catch {
      return false
    }
  }, 'must be an http(s) URL without a query or fragment')
  .refine((value) => {
    try {
      const url = new URL(value)
      return url.username === '' && url.password === ''
    } catch {
      return true
    }
  }, 'must not contain credentials')
  .transform((value) => value.replace(/\/+$/, ''))

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
    VITE_AUTH_BASE_URL: baseUrlSchema,
    VITE_CORE_BASE_URL: baseUrlSchema,
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
    if (value.VITE_ENVIRONMENT !== 'local') {
      for (const key of ['VITE_AUTH_BASE_URL', 'VITE_CORE_BASE_URL'] as const) {
        if (!value[key].startsWith('https://')) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'must use https outside the local environment',
          })
        }
      }
    }
  })

/** The portal's configuration, parsed once at boot. */
export type Env = {
  readonly environment: Environment
  readonly authBaseUrl: string
  readonly coreBaseUrl: string
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
    authBaseUrl: value.VITE_AUTH_BASE_URL,
    coreBaseUrl: value.VITE_CORE_BASE_URL,
    sentryDsn: value.VITE_SENTRY_DSN,
    release: value.VITE_RELEASE,
  }
}

/** The origin (scheme, host and port) of a URL, as a Content-Security-Policy source. */
export function originOf(url: string): string {
  return new URL(url).origin
}
