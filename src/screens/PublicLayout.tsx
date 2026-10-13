import { Outlet } from '@tanstack/react-router'
import { Logo } from '~/ui/Logo'

/** The frame around sign-in and sign-up: the logo above a single column. */
export function PublicLayout() {
  return (
    <main className='public' id='main'>
      <Logo />
      <div className='card'>
        <Outlet />
      </div>
    </main>
  )
}
