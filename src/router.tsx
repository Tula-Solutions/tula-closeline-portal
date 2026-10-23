import { createRouter, type RouterHistory } from '@tanstack/react-router'
import type { App } from '~/app'
import { routeTree } from '~/routeTree.gen'
import { prefersReducedMotion } from '~/ui/motion'

/** Creates the router with the app in its context; tests pass an in-memory history. */
export function createAppRouter(app: App, history?: RouterHistory) {
  const router = createRouter({
    routeTree,
    context: { app },
    defaultPreload: 'intent',
    // Page changes run as view transitions where the browser has them (the CSS is in index.css).
    defaultViewTransition: true,
    ...(history ? { history } : {}),
  })
  // The first page is simply there (a transition out of a blank page would fade the whole form
  // in), and under reduced motion no page change starts a transition, not even its one-frame
  // snapshot. Every later page change takes the default.
  const start = router.startViewTransition
  router.startViewTransition = (update) => {
    if (router.state.resolvedLocation === undefined || prefersReducedMotion()) {
      router.shouldViewTransition = false
    }
    return start(update)
  }
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
