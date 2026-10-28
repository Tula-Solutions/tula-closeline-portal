import { useQuery } from '@tanstack/react-query'
import { Navigate, Outlet, useRouterState } from '@tanstack/react-router'
import { Menu, X } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { useApp, useSessionState } from '~/app-context'
import { NavGroup, NavLink, SubNavLink } from '~/components/app/nav-link'
import { ThemeMenu } from '~/components/app/theme-menu'
import { Button } from '~/components/ui/button'
import { can } from '~/data/permissions'
import { cn } from '~/lib/utils'
import { Softphone } from '~/screens/softphone/Softphone'
import type { Role } from '~/session/session'
import { Logo } from '~/ui/Logo'
import { DUR, reveal } from '~/ui/motion'

const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  rep: 'Rep',
}

/** The authenticated frame: a sidebar (the logo, navigation, the Organization and person, appearance and sign-out) and the page. */
export function Shell() {
  const app = useApp()
  const session = useSessionState()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [open, setOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const asideRef = useRef<HTMLElement>(null)
  // Where focus goes once the drawer is closed (the rest of the page is inert until then).
  const returnFocus = useRef<'toggle' | 'main' | null>(null)
  const openRef = useRef(open)
  openRef.current = open
  const close = (to: 'toggle' | 'main') => {
    returnFocus.current = to
    setOpen(false)
  }
  const organization = useQuery({
    queryKey: ['organization', session.status === 'signed_in' ? session.organization.id : null],
    queryFn: ({ signal }) => app.core.getOrganization(signal),
    enabled: session.status === 'signed_in',
  })
  // A new page closes the drawer on a narrow screen and, if it was open, puts focus on the page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the drawer closes when the page changes
  useEffect(() => {
    if (openRef.current) {
      returnFocus.current = 'main'
    }
    setOpen(false)
  }, [pathname])
  // The drawer is modal: focus moves into it when it opens and back out when it closes.
  useEffect(() => {
    if (open) {
      closeRef.current?.focus()
      // The links follow the drawer in, 20 ms apart.
      reveal(asideRef.current?.querySelectorAll('nav a') ?? [], {
        delay: 60,
        step: 20,
        rise: '0px',
        duration: DUR.ui,
      })
      return
    }
    if (returnFocus.current === 'toggle') {
      toggleRef.current?.focus()
    } else if (returnFocus.current === 'main') {
      mainRef.current?.focus()
    }
    returnFocus.current = null
  }, [open])
  // Growing to a wide screen turns the drawer into the fixed column: it is no longer modal.
  useEffect(() => {
    if (!open || typeof window.matchMedia !== 'function') {
      return undefined
    }
    const wide = window.matchMedia('(min-width: 768px)')
    const onChange = (event: { matches: boolean }) => {
      if (event.matches) {
        setOpen(false)
      }
    }
    wide.addEventListener('change', onChange)
    return () => wide.removeEventListener('change', onChange)
  }, [open])
  // Escape closes it, and Tab wraps inside it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: close only sets a ref and state
  useEffect(() => {
    if (!open) {
      return undefined
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close('toggle')
        return
      }
      if (event.key !== 'Tab' || asideRef.current === null) {
        return
      }
      const items = [...asideRef.current.querySelectorAll<HTMLElement>('a[href], button')].filter(
        (item) => !item.hasAttribute('disabled')
      )
      const first = items[0]
      const last = items[items.length - 1]
      if (
        event.shiftKey &&
        (document.activeElement === first || !asideRef.current.contains(document.activeElement))
      ) {
        event.preventDefault()
        last?.focus()
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !asideRef.current.contains(document.activeElement))
      ) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  if (session.status === 'signed_out') {
    return <Navigate to='/sign-in' replace />
  }
  if (session.status !== 'signed_in') {
    // Restoring or unreachable: the session gate above shows the pending or retry screen.
    return null
  }
  const role = session.organization.role
  const inPlaybook = pathname === '/playbook' || pathname.startsWith('/playbook/')
  const inSales = pathname === '/sales-history' || pathname.startsWith('/sales-history/')
  return (
    <div className='min-h-dvh md:grid md:grid-cols-[15rem_minmax(0,1fr)]'>
      <a
        inert={open}
        className='sr-only z-[60] rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3'
        href='#main'
      >
        Skip to content
      </a>
      <header
        inert={open}
        className='sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background px-3 [view-transition-name:topbar] md:hidden'
      >
        <Button
          ref={toggleRef}
          variant='ghost'
          size='icon'
          aria-label='Navigation menu'
          aria-expanded={open}
          aria-controls='app-sidebar'
          onClick={() => setOpen((now) => !now)}
        >
          {open ? <X aria-hidden='true' /> : <Menu aria-hidden='true' />}
        </Button>
        <Logo className='w-[7.5rem]' />
      </header>
      {/* Kept mounted so it can fade out as well as in; closed, it is hidden and inert. */}
      <button
        type='button'
        aria-label='Close the navigation backdrop'
        aria-hidden={!open}
        inert={!open}
        tabIndex={-1}
        className={cn(
          'fixed inset-0 z-40 bg-[rgb(26_26_24/0.48)] transition-[opacity,visibility] md:hidden',
          open
            ? 'visible opacity-100 duration-200 ease-(--ease-out)'
            : 'invisible opacity-0 duration-160 ease-(--ease-in)'
        )}
        onClick={() => close('toggle')}
      />
      <aside
        ref={asideRef}
        id='app-sidebar'
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-4 border-r border-sidebar-border bg-sidebar py-6 pr-5 pl-3 text-sidebar-foreground shadow-elev-3 transition-[transform,visibility] duration-200 ease-snappy md:sticky md:top-0 md:z-auto md:h-dvh md:w-auto md:max-w-none md:translate-x-0 md:shadow-none md:visible md:[view-transition-name:sidebar]',
          open ? 'visible translate-x-0' : 'max-md:invisible max-md:-translate-x-full'
        )}
      >
        <div className='flex items-center justify-between pl-4'>
          <Logo className='w-[7.5rem]' />
          <Button
            ref={closeRef}
            variant='ghost'
            size='icon-sm'
            className='md:hidden'
            aria-label='Close menu'
            onClick={() => close('toggle')}
          >
            <X aria-hidden='true' />
          </Button>
        </div>
        <div className='border-y border-sidebar-border py-4 pl-4'>
          {/* An Organization's name is untrusted text: <bdi> keeps a direction override from leaking out. */}
          <bdi className='block truncate font-serif text-xl leading-tight tracking-[-0.01em]'>
            {organization.data?.name ?? 'Your Organization'}
          </bdi>
          <span className='label-mono mt-1 block'>{ROLE_LABEL[role]}</span>
        </div>
        <nav aria-label='Main' className='flex flex-1 flex-col overflow-y-auto pb-2'>
          <div className='flex flex-col pt-4'>
            <NavLink to='/' exact>
              Home
            </NavLink>
            <NavLink to='/prospects'>Prospects</NavLink>
            <NavLink to='/inbox' exact>
              Inbox
            </NavLink>
            <NavLink to='/inbox/approvals'>Approvals</NavLink>
            {can.manageApprovalPolicy(role) ? (
              <NavLink to='/inbox/policy'>Approval policy</NavLink>
            ) : null}
            {can.manageEscalationRules(role) ? (
              <NavLink to='/inbox/escalation'>Escalation rules</NavLink>
            ) : null}
            {can.viewAgent(role) ? <NavLink to='/agent'>Agent</NavLink> : null}
            <NavLink to='/calendar'>Calendar</NavLink>
            <NavLink to='/bookings'>Bookings</NavLink>
            <NavLink to='/calls'>Call history</NavLink>
          </div>
          <NavGroup id='organization' label='Organization'>
            {can.viewMembers(role) ? <NavLink to='/members'>Members</NavLink> : null}
            {can.manageInvitations(role) ? <NavLink to='/invitations'>Invitations</NavLink> : null}
            <NavLink to='/teams'>Teams</NavLink>
            {can.manageBookingTypes(role) ? (
              <NavLink to='/booking-types'>Booking Types</NavLink>
            ) : null}
            {can.manageRoutingRules(role) ? <NavLink to='/routing'>Routing</NavLink> : null}
            {can.manageLines(role) ? <NavLink to='/lines'>Lines</NavLink> : null}
            {can.manageApiKeys(role) ? <NavLink to='/api-keys'>API keys</NavLink> : null}
            {can.viewAudit(role) ? <NavLink to='/audit'>Audit log</NavLink> : null}
            {can.manageExports(role) ? <NavLink to='/export'>Data export</NavLink> : null}
            <NavLink to='/developers'>Developers</NavLink>
            <NavLink to='/consent-wordings'>Consent Wording</NavLink>
            {can.manageConsentWording(role) ? (
              <NavLink to='/consent-forms'>Consent forms</NavLink>
            ) : null}
            {can.manageSuppression(role) ? <NavLink to='/suppression'>Suppression</NavLink> : null}
          </NavGroup>
          <NavGroup id='analytics' label='Analytics'>
            <NavLink to='/analytics' exact>
              Overview
            </NavLink>
            {can.compareCampaigns(role) ? (
              <NavLink to='/analytics/campaigns'>Campaigns</NavLink>
            ) : null}
            <NavLink to='/analytics/reps'>{role === 'rep' ? 'Your numbers' : 'Reps'}</NavLink>
            {can.reviewAssessments(role) ? <NavLink to='/assessments'>Assessments</NavLink> : null}
            {can.viewAttribution(role) ? (
              <NavLink to='/analytics/sources'>Playbook sources</NavLink>
            ) : null}
          </NavGroup>
          <NavGroup id='knowledge' label='Knowledge'>
            <NavLink to='/playbook'>Playbook</NavLink>
            {inPlaybook ? (
              <nav aria-label='Playbook' className='flex flex-col pb-1 motion-safe:animate-fade'>
                <SubNavLink to='/playbook' exact>
                  Documents
                </SubNavLink>
                {can.searchDocuments(role) ? (
                  <SubNavLink to='/playbook/search'>Search</SubNavLink>
                ) : null}
                {can.managePlaybook(role) ? (
                  <SubNavLink to='/playbook/suggestions'>Suggestions</SubNavLink>
                ) : null}
              </nav>
            ) : null}
          </NavGroup>
          {can.manageSalesHistory(role) ? (
            <NavGroup id='sales' label='Sales'>
              <NavLink to='/sales-history'>Sales history</NavLink>
              {inSales ? (
                <nav
                  aria-label='Sales history'
                  className='flex flex-col pb-1 motion-safe:animate-fade'
                >
                  <SubNavLink to='/sales-history' exact>
                    Overview
                  </SubNavLink>
                  <SubNavLink to='/sales-history/deals'>Deals</SubNavLink>
                  <SubNavLink to='/sales-history/imports'>Imports</SubNavLink>
                  <SubNavLink to='/sales-history/calls'>Calls</SubNavLink>
                  <SubNavLink to='/sales-history/rights'>Rights confirmation</SubNavLink>
                  {can.searchWonDeals(role) ? (
                    <SubNavLink to='/sales-history/search'>Search</SubNavLink>
                  ) : null}
                </nav>
              ) : null}
            </NavGroup>
          ) : null}
        </nav>
        <div className='flex flex-col border-t border-sidebar-border pt-3 pl-4'>
          <ThemeMenu />
          <button
            type='button'
            className='rounded-sm py-1.5 text-left text-sm text-muted-foreground outline-hidden hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:py-2.5'
            onClick={() => app.session.signOut()}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main
        ref={mainRef}
        inert={open}
        id='main'
        tabIndex={-1}
        className='relative min-w-0 px-4 py-8 outline-hidden [view-transition-name:page] md:px-12 md:py-12 xl:px-16 pb-24 md:pb-28'
      >
        <div className='w-full max-w-[72rem]'>
          {/* Keyed by Organization: another Organization starts every screen fresh, with no state of the last. */}
          <Fragment key={session.organization.id}>
            <Outlet />
          </Fragment>
        </div>
      </main>
      <div inert={open}>
        <Softphone />
      </div>
    </div>
  )
}
