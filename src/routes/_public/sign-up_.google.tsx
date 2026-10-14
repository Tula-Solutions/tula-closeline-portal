import { createFileRoute } from '@tanstack/react-router'
import { GOOGLE_SIGN_UP_ATTEMPT_PARAM, googleSignUpQuerySchema } from 'tula-closeline-contract'
import { GoogleSignUpScreen } from '~/screens/GoogleSignUpScreen'

export const Route = createFileRoute('/_public/sign-up_/google')({
  // The attempt id is the only thing the address carries (never a secret); anything else is dropped.
  validateSearch: (search: Record<string, unknown>): { attempt?: string } => {
    const parsed = googleSignUpQuerySchema.safeParse({
      attempt: search[GOOGLE_SIGN_UP_ATTEMPT_PARAM],
    })
    return parsed.success ? { attempt: parsed.data.attempt } : {}
  },
  component: function GoogleSignUpRoute() {
    const { attempt } = Route.useSearch()
    return <GoogleSignUpScreen attempt={attempt} />
  },
})
