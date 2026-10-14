import { useQuery } from '@tanstack/react-query'
import { Navigate, Outlet, useRouterState } from '@tanstack/react-router'
import {
  BookOpen,
  Building2,
  House,
  LogOut,
  Mail,
  Menu,
  TrendingUp,
  Users,
  UsersRound,
  X,
} from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { useApp, useSessionState } from '~/app-context'
import { NavLink, SubNavLink } from '~/components/app/nav-link'
import { ThemeMenu } from '~/components/app/theme-menu'
import { Button } from '~/components/ui/button'
import { Separator } from '~/components/ui/separator'
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
  const openRef = useRef(open)
  openRef.current = open
  const organization = useQuery({
    queryKey: ['organization', session.status === 'signed_in' ? session.organization.id : null],
    queryFn: ({ signal }) => app.core.getOrganization(signal),
    enabled: session.status === 'signed_in',
  })
  // A new page closes the drawer on a narrow screen and, if it was open, puts focus on the page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the drawer closes when the page changes
  useEffect(() => {
    if (openRef.current) {
      mainRef.current?.focus()
    }
    setOpen(false)
  }, [pathname])
  // Opening the drawer moves focus into it, so a keyboard user is not left behind it.
  useEffect(() => {
    if (open) {
      closeRef.current?.focus()
    }
  }, [open])
  // Escape closes it too.
  useEffect(() => {
    if (!open) {
      return undefined
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
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
    <div className='min-h-dvh md:grid md:grid-cols-[17rem_minmax(0,1fr)]'>
      <a
        className='sr-only z-[60] rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3'
        href='#main'
      >
        Skip to content
      </a>
      <div className='sticky top-0 z-30 flex items-center gap-3 border-b bg-background/90 px-4 py-2 backdrop-blur md:hidden'>
        <Button
          ref={toggleRef}
          variant='ghost'
          size='icon'
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          aria-expanded={open}
          aria-controls='app-sidebar'
          onClick={() => setOpen((now) => !now)}
        >
          {open ? <X aria-hidden='true' /> : <Menu aria-hidden='true' />}
        </Button>
        <span className='text-sm font-semibold'>Closeline</span>
      </div>
      {open ? (
        <button
          type='button'
          aria-label='Close the navigation backdrop'
          tabIndex={-1}
          className='fixed inset-0 z-40 bg-foreground/40 md:hidden'
          onClick={() => {
            setOpen(false)
            toggleRef.current?.focus()
          }}
        />
      ) : null}
      <aside
        id='app-sidebar'
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-4 border-r border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground transition-[transform,visibility] duration-200 md:sticky md:top-0 md:z-auto md:h-dvh md:w-auto md:max-w-none md:translate-x-0 md:visible',
          open ? 'visible translate-x-0' : 'max-md:invisible max-md:-translate-x-full'
        )}
      >
        <div className='flex items-center justify-between px-2 pt-1'>
          <Logo className='w-36' />
          <Button
            ref={closeRef}
            variant='ghost'
            size='icon'
            className='md:hidden'
            aria-label='Close menu'
            onClick={() => {
              setOpen(false)
              toggleRef.current?.focus()
            }}
          >
            <X aria-hidden='true' />
          </Button>
        </div>
        <nav aria-label='Main' className='flex flex-1 flex-col gap-1 overflow-y-auto'>
          <NavLink to='/' icon={House} exact>
            Home
          </NavLink>
          {can.viewMembers(role) ? (
            <NavLink to='/members' icon={Users}>
              Members
            </NavLink>
          ) : null}
          {can.manageInvitations(role) ? (
            <NavLink to='/invitations' icon={Mail}>
              Invitations
            </NavLink>
          ) : null}
          <NavLink to='/teams' icon={UsersRound}>
            Teams
          </NavLink>
          <NavLink to='/playbook' icon={BookOpen}>
            Playbook
          </NavLink>
          {inPlaybook ? (
            <nav aria-label='Playbook' className='mb-1 ml-5 flex flex-col gap-0.5 border-l pl-2'>
              <SubNavLink to='/playbook' exact>
                Documents
              </SubNavLink>
              {can.searchDocuments(role) ? (
                <SubNavLink to='/playbook/search'>Search</SubNavLink>
              ) : null}
            </nav>
          ) : null}
          {can.manageSalesHistory(role) ? (
            <>
              <NavLink to='/sales-history' icon={TrendingUp}>
                Sales history
              </NavLink>
              {inSales ? (
                <nav
                  aria-label='Sales history'
                  className='mb-1 ml-5 flex flex-col gap-0.5 border-l pl-2'
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
            </>
          ) : null}
        </nav>
        <Separator />
        <div className='flex flex-col gap-3'>
          <div className='flex items-center gap-3 px-2'>
            <span className='flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'>
              <Building2 aria-hidden='true' className='size-[18px]' />
            </span>
            <div className='min-w-0'>
              {/* An Organization's name is untrusted text: <bdi> keeps a direction override from leaking out. */}
              <bdi className='block truncate text-sm font-semibold'>
                {organization.data?.name ?? 'Your Organization'}
              </bdi>
              <span className='text-xs text-muted-foreground'>{ROLE_LABEL[role]}</span>
            </div>
          </div>
          <div className='flex flex-col'>
            <ThemeMenu />
            <Button
              variant='ghost'
              size='sm'
              className='justify-start'
              onClick={() => app.session.signOut()}
            >
              <LogOut aria-hidden='true' />
              Sign out
            </Button>
          </div>
        </div>
      </aside>
      <main
        ref={mainRef}
        id='main'
        tabIndex={-1}
        className='min-w-0 px-4 py-8 outline-none md:px-10 md:py-10'
      >
        <div className='mx-auto w-full max-w-6xl'>
          {/* Keyed by Organization: another Organization starts every screen fresh, with no state of the last. */}
          <Fragment key={session.organization.id}>
            <Outlet />
          </Fragment>
        </div>
      </main>
    </div>
  )
}
