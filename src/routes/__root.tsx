import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import type { App } from '~/app'
import { ErrorScreen } from '~/screens/ErrorScreen'
import { NotFoundScreen } from '~/screens/NotFoundScreen'

export const Route = createRootRouteWithContext<{ app: App }>()({
  component: Outlet,
  notFoundComponent: NotFoundScreen,
  errorComponent: ({ error }) => <ErrorScreen error={error} />,
})
