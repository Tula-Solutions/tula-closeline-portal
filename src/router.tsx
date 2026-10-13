import { createRouter, type RouterHistory } from '@tanstack/react-router'
import type { App } from '~/app'
import { routeTree } from '~/routeTree.gen'

/** Creates the router with the app in its context; tests pass an in-memory history. */
export function createAppRouter(app: App, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context: { app },
    defaultPreload: 'intent',
    ...(history ? { history } : {}),
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
