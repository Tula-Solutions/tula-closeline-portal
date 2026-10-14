import { createFileRoute, redirect } from '@tanstack/react-router'
import { parseReturnPath } from '~/data/return-path'
import { Shell } from '~/screens/Shell'

export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context, location }) => {
    if (context.app.session.getSnapshot().status !== 'signed_in') {
      // Remember the page that was asked for (a relative address only) so sign-in can return to it.
      const back = parseReturnPath(`${location.pathname}${location.searchStr}`)
      throw redirect({
        to: '/sign-in',
        search: back === undefined || back === '/' ? {} : { redirect: back },
      })
    }
  },
  component: Shell,
})
