import { useEffect } from 'react'
import { useApp } from '~/app-context'
import { Button } from '~/components/ui/button'
import { Logo } from '~/ui/Logo'
import { useDocumentTitle } from '~/ui/useDocumentTitle'

/** Shown when a screen crashes; reports the error once (expected failures are dropped by the reporter). */
export function ErrorScreen(props: { readonly error: unknown }) {
  const { reporter } = useApp()
  useDocumentTitle('Something went wrong')
  const { error } = props
  useEffect(() => {
    reporter.report(error)
  }, [reporter, error])
  return (
    <main
      className='mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center [&_p]:m-0'
      role='alert'
    >
      <Logo className='mb-4 w-40' />
      <h1 className='text-2xl font-semibold tracking-tight'>Something went wrong</h1>
      <p>We have been told about it. Reload the page to try again.</p>
      <Button onClick={() => window.location.reload()}>Reload</Button>
    </main>
  )
}
