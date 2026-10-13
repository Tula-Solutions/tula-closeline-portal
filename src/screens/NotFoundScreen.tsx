import { Link } from '@tanstack/react-router'
import { Logo } from '~/ui/Logo'
import { useDocumentTitle } from '~/ui/useDocumentTitle'

/** Shown for an address that matches no page. */
export function NotFoundScreen() {
  useDocumentTitle('Page not found')
  return (
    <main className='page-centered'>
      <Logo />
      <h1>Page not found</h1>
      <p>There is nothing at this address.</p>
      <Link to='/'>Go to the home page</Link>
    </main>
  )
}
