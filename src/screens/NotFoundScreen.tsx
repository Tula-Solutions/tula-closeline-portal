import { Link } from '@tanstack/react-router'
import { Logo } from '~/ui/Logo'
import { useDocumentTitle } from '~/ui/useDocumentTitle'

/** Shown for an address that matches no page. */
export function NotFoundScreen() {
  useDocumentTitle('Page not found')
  return (
    <main className='mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center [&_p]:m-0'>
      <Logo className='mb-4 w-40' />
      <h1 className='text-2xl font-semibold tracking-tight'>Page not found</h1>
      <p>There is nothing at this address.</p>
      <Link to='/' className='font-semibold text-primary underline-offset-4 hover:underline'>
        Go to the home page
      </Link>
    </main>
  )
}
