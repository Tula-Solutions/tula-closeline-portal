import { createFileRoute, Outlet } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'

const MarketingLayout = lazy(() =>
  import('~/marketing/MarketingLayout').then((m) => ({ default: m.MarketingLayout }))
)

/** The public pages of the site, set inside the marketing frame whether or not anyone is signed in. */
function SiteFrame() {
  return (
    <Suspense fallback={null}>
      <MarketingLayout>
        <Outlet />
      </MarketingLayout>
    </Suspense>
  )
}

export const Route = createFileRoute('/_site')({ component: SiteFrame })
