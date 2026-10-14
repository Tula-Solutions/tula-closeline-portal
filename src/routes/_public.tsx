import { createFileRoute, redirect } from '@tanstack/react-router'
import { parseReturnPath } from '~/data/return-path'
import { PublicLayout } from '~/screens/PublicLayout'

export const Route = createFileRoute('/_public')({
  beforeLoad: ({ context, location }) => {
    if (context.app.session.getSnapshot().status === 'signed_in') {
      // With a valid return address the layout sends the person there (it is a plain address, which
      // `redirect` takes only as typed route parameters); otherwise Home.
      const back = parseReturnPath(new URLSearchParams(location.searchStr).get('redirect'))
      if (back === undefined) {
        throw redirect({ to: '/' })
      }
    }
  },
  component: PublicLayout,
})
