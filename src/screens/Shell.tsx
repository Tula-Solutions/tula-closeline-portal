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
import type { Role } from '~/session/session'
import { Logo } from '~/ui/Logo'

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
      <div
        inert={open}
        className='sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background px-3 md:hidden'
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
        <span className='font-serif text-lg tracking-[-0.01em]'>Closeline</span>
      </div>
      {open ? (
        <button
          type='button'
          aria-label='Close the navigation backdrop'
          tabIndex={-1}
          className='fixed inset-0 z-40 bg-foreground/40 md:hidden'
          onClick={() => close('toggle')}
        />
      ) : null}
      <aside
        ref={asideRef}
        id='app-sidebar'
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-4 border-r border-sidebar-border bg-sidebar py-6 pr-5 pl-3 text-sidebar-foreground shadow-elev-3 transition-[transform,visibility] duration-200 ease-snappy md:sticky md:top-0 md:z-auto md:h-dvh md:w-auto md:max-w-none md:translate-x-0 md:shadow-none md:visible',
          open ? 'visible translate-x-0' : 'max-md:invisible max-md:-translate-x-full'
        )}
      >
        <div className='flex items-center justify-between pl-4'>
          <Logo className='w-28' />
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
          </div>
          <NavGroup id='organization' label='Organization'>
            {can.viewMembers(role) ? <NavLink to='/members'>Members</NavLink> : null}
            {can.manageInvitations(role) ? <NavLink to='/invitations'>Invitations</NavLink> : null}
            <NavLink to='/teams'>Teams</NavLink>
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
        className='relative min-w-0 px-4 py-8 outline-hidden md:px-12 md:py-12 xl:px-16'
      >
        <div className='w-full max-w-[72rem]'>
          {/* Keyed by Organization: another Organization starts every screen fresh, with no state of the last. */}
          <Fragment key={session.organization.id}>
            <Outlet />
          </Fragment>
        </div>
      </main>
    </div>
  )
}
