import { useEffect } from 'react'
import { useApp } from '~/app-context'
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
    <main className='page-centered' role='alert'>
      <Logo />
      <h1>Something went wrong</h1>
      <p>We have been told about it. Reload the page to try again.</p>
      <button type='button' className='button' onClick={() => window.location.reload()}>
        Reload
      </button>
    </main>
  )
}
