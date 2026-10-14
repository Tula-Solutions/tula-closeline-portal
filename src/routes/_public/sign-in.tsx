import { createFileRoute } from '@tanstack/react-router'
import { GOOGLE_ERROR_PARAM } from 'tula-closeline-contract'
import { googleErrorCode } from '~/data/google'
import { parseReturnPath } from '~/data/return-path'
import { SignInScreen } from '~/screens/SignInScreen'

export const Route = createFileRoute('/_public/sign-in')({
  // Only a relative address of this portal is kept; anything else is dropped.
  validateSearch: (search: Record<string, unknown>): { redirect?: string; error?: string } => {
    const redirect = parseReturnPath(search.redirect)
    // `error` is a code the Google callback put there; anything that is not shaped like one is dropped.
    const error = googleErrorCode(search[GOOGLE_ERROR_PARAM])
    return {
      ...(redirect === undefined ? {} : { redirect }),
      ...(error === undefined ? {} : { error }),
    }
  },
  component: SignInScreen,
})
