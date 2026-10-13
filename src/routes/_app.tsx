import { createFileRoute, redirect } from '@tanstack/react-router'
import { Shell } from '~/screens/Shell'

export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context }) => {
    if (context.app.session.getSnapshot().status !== 'signed_in') {
      throw redirect({ to: '/sign-in' })
    }
  },
  component: Shell,
})
