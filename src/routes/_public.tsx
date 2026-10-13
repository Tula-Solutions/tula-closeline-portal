import { createFileRoute, redirect } from '@tanstack/react-router'
import { PublicLayout } from '~/screens/PublicLayout'

export const Route = createFileRoute('/_public')({
  beforeLoad: ({ context }) => {
    if (context.app.session.getSnapshot().status === 'signed_in') {
      throw redirect({ to: '/' })
    }
  },
  component: PublicLayout,
})
