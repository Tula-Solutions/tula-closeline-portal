import { createFileRoute, redirect } from '@tanstack/react-router'
import { parseReturnPath } from '~/data/return-path'
import { AppFrame } from '~/screens/AppFrame'

export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context, location }) => {
    // The home page at `/` is the public site for anyone who is not signed in.
    if (location.pathname !== '/' && context.app.session.getSnapshot().status !== 'signed_in') {
      // Remember the page that was asked for (a relative address only) so sign-in can return to it.
      const back = parseReturnPath(`${location.pathname}${location.searchStr}`)
      throw redirect({
        to: '/sign-in',
        search: back === undefined || back === '/' ? {} : { redirect: back },
      })
    }
  },
  component: AppFrame,
})
