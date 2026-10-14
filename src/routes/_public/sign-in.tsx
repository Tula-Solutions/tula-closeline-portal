import { createFileRoute } from '@tanstack/react-router'
import { parseReturnPath } from '~/data/return-path'
import { SignInScreen } from '~/screens/SignInScreen'

export const Route = createFileRoute('/_public/sign-in')({
  // Only a relative address of this portal is kept; anything else is dropped.
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const redirect = parseReturnPath(search.redirect)
    return redirect === undefined ? {} : { redirect }
  },
  component: SignInScreen,
})
