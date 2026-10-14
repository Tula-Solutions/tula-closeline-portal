import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { GoogleIntent } from 'tula-closeline-contract'
import { returnToSchema } from 'tula-closeline-contract'
import { ApiError, CLIENT_ERRORS, clientError } from '~/api/errors'
import { GOOGLE_GENERIC_MESSAGE, present } from '~/api/messages'
import { useApp } from '~/app-context'
import { Button } from '~/components/ui/button'
import { allowedAuthorizationUrl } from '~/data/google'

/** Google's multicolour "G", drawn inline so no image is fetched and the CSP stays as it is. */
export function GoogleGlyph(props: { readonly className?: string }) {
  return (
    <svg
      aria-hidden='true'
      focusable='false'
      viewBox='0 0 48 48'
      className={props.className ?? 'size-[18px]'}
    >
      <path
        fill='#EA4335'
        d='M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z'
      />
      <path
        fill='#4285F4'
        d='M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z'
      />
      <path
        fill='#FBBC05'
        d='M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z'
      />
      <path
        fill='#34A853'
        d='M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z'
      />
    </svg>
  )
}

/**
 * Whether Google sign-in is on, from the auth service's options. Any failure means off, so a
 * button that would only fail is never shown; the options are read once and kept.
 */
export function useGoogleEnabled(): boolean {
  const app = useApp()
  const options = useQuery({
    queryKey: ['auth-options'],
    queryFn: ({ signal }) => app.auth.authOptions(signal),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
  return options.data?.providers.google === true
}

/**
 * "Continue with Google". It asks auth to start the flow, checks that the address it got back is
 * Google's (or, locally, the configured fake), and only then leaves the page for it. It follows
 * Google's branding: the multicolour G on a white button with a thin grey border.
 */
export function GoogleButton(props: { readonly intent: GoogleIntent; readonly returnTo?: string }) {
  const app = useApp()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const returnTo =
    props.returnTo !== undefined && returnToSchema.safeParse(props.returnTo).success
      ? props.returnTo
      : undefined

  const go = async () => {
    if (pending) {
      return
    }
    setPending(true)
    setError(null)
    try {
      const raw = await app.auth.startGoogle({
        intent: props.intent,
        ...(returnTo === undefined ? {} : { returnTo }),
      })
      const target = allowedAuthorizationUrl(raw, app.env.googleFakeIssuerHost)
      if (target === null) {
        throw clientError(CLIENT_ERRORS.badResponse, 200)
      }
      // The page is left for Google; it stays "pending" so a second click cannot start another attempt.
      app.assign(target.toString())
    } catch (failure) {
      setPending(false)
      setError(
        failure instanceof ApiError
          ? failure.code === CLIENT_ERRORS.badResponse
            ? 'We could not start the sign-in with Google. Try again, or use your email address and password.'
            : present(failure, 'sign-in').message
          : GOOGLE_GENERIC_MESSAGE
      )
    }
  }

  return (
    <div className='grid gap-2'>
      <Button
        type='button'
        variant='outline'
        size='lg'
        className='w-full border-[#747775] bg-white text-[#1f1f1f] hover:bg-[#f8f9fa] hover:text-[#1f1f1f] dark:bg-white dark:hover:bg-[#f8f9fa]'
        aria-disabled={pending}
        onClick={() => void go()}
      >
        <GoogleGlyph />
        {pending ? 'Opening Google...' : 'Continue with Google'}
      </Button>
      {error === null ? null : (
        <p role='alert' className='m-0 text-sm font-medium text-danger'>
          <strong>Error:</strong> {error}
        </p>
      )}
    </div>
  )
}
