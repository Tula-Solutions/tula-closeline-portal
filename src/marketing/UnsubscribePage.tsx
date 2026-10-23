import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { CONSENT_ERRORS, ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { useApp } from '~/app-context'
import { UNSUBSCRIBE_PAGE } from '~/marketing/copy/unsubscribe'
import { usePageMeta } from '~/marketing/usePageMeta'
import { Banner } from '~/ui/Banner'
import { SubmitButton } from '~/ui/SubmitButton'
import { Untrusted } from '~/ui/Untrusted'
import { useSubmit } from '~/ui/useSubmit'

const WIDTH = 'mx-auto max-w-[88rem] px-4 sm:px-8'
const LINK =
  'rounded-sm underline decoration-border-strong decoration-1 underline-offset-4 outline-hidden hover:decoration-current focus-visible:ring-2 focus-visible:ring-ring'

/** True when the contract says the link does not work (tampered, expired or unknown: all one answer). */
function isInvalidLink(error: unknown): boolean {
  return error instanceof ApiError && error.code === CONSENT_ERRORS['consent.invalid_token'].code
}

/** The words for a failed call, chosen by the contract's `area.reason` code and never the status. */
function failureWords(error: unknown): string {
  if (error instanceof ApiError && error.code === ERRORS['rate.limited'].code) {
    return UNSUBSCRIBE_PAGE.rateLimited
  }
  return UNSUBSCRIBE_PAGE.unreachable
}

/** Puts a sentence naming the sender as text, with the sender isolated as untrusted. */
function Sentence(props: { readonly build: (sender: string) => string; readonly sender: string }) {
  const marker = '\u0000'
  const [before = '', after = ''] = props.build(marker).split(marker)
  return (
    <>
      {before}
      <Untrusted value={props.sender} />
      {after}
    </>
  )
}

/**
 * The public unsubscribe page, reached from the link in a message: no sign-in. It reads who sent
 * the message (a read that changes nothing, so a mail scanner opening the link unsubscribes no
 * one), then a button sends the one-click request. The button sits in a real form that posts the
 * RFC 8058 pair to core's route, so the request is the same one a mail client sends; the script
 * only keeps the person on this page. A bad, changed or expired link gets one calm message that
 * says nothing about any address.
 */
export function UnsubscribePage(props: { readonly token: string }) {
  const app = useApp()
  const copy = UNSUBSCRIBE_PAGE
  usePageMeta(copy.meta)
  const { token } = props
  useEffect(() => {
    // The token is a secret in the address: no report may carry it.
    app.reporter.redact(token)
  }, [app, token])
  const preview = useQuery({
    queryKey: ['unsubscribe-preview', token],
    queryFn: ({ signal }) => app.unsubscribe.preview(token, signal),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  })
  const [done, setDone] = useState(false)
  const [refused, setRefused] = useState(false)
  const [failure, setFailure] = useState<string | undefined>()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const send = useSubmit<null>(
    async () => {
      await app.unsubscribe.unsubscribe(token)
      setFailure(undefined)
      setDone(true)
    },
    {
      onError(error) {
        if (isInvalidLink(error)) {
          // The link went bad between opening and clicking: the same calm message as on arrival.
          setFailure(undefined)
          setRefused(true)
          return
        }
        setFailure(failureWords(error))
      },
    }
  )
  const invalid = refused || (preview.isError && isInvalidLink(preview.error))
  useEffect(() => {
    if (done || invalid) {
      headingRef.current?.focus()
    }
  }, [done, invalid])

  const heading = 'm-0 font-serif text-3xl tracking-[-0.02em] outline-hidden'
  let body: React.ReactNode
  if (done && preview.data) {
    body = (
      <>
        <h2 ref={headingRef} tabIndex={-1} className={heading}>
          {copy.done.heading}
        </h2>
        <p role='status' className='m-0 mt-3 max-w-[48ch] leading-relaxed'>
          <Sentence build={copy.done.text} sender={preview.data.organizationName} />
        </p>
        <Link to='/' className={`mt-6 inline-block ${LINK}`}>
          {copy.done.homeLink}
        </Link>
      </>
    )
  } else if (invalid) {
    body = (
      <>
        <h2 ref={headingRef} tabIndex={-1} className={heading}>
          {copy.invalid.heading}
        </h2>
        <p className='m-0 mt-3 max-w-[48ch] leading-relaxed'>{copy.invalid.text}</p>
        <Link to='/' className={`mt-6 inline-block ${LINK}`}>
          {copy.done.homeLink}
        </Link>
      </>
    )
  } else if (preview.isError) {
    body = (
      <>
        <Banner kind='error'>{failureWords(preview.error)}</Banner>
        <button
          type='button'
          className={`bg-transparent p-0 ${LINK}`}
          onClick={() => void preview.refetch()}
        >
          {copy.retry}
        </button>
      </>
    )
  } else if (preview.data) {
    const sender = preview.data.organizationName
    body = (
      <>
        <h2 className={heading}>{copy.confirm.heading}</h2>
        <p className='m-0 mt-3 max-w-[48ch] leading-relaxed'>
          <Sentence build={copy.confirm.text} sender={sender} />
        </p>
        {failure ? (
          <Banner kind='error' className='mt-4'>
            {failure}
          </Banner>
        ) : null}
        <form
          method='post'
          action={`/v1/public/unsubscribe/${encodeURIComponent(token)}`}
          className='mt-6'
          onSubmit={(event) => {
            event.preventDefault()
            if (!send.pending) {
              send.submit(null)
            }
          }}
        >
          <input type='hidden' name='List-Unsubscribe' value='One-Click' />
          <SubmitButton pending={send.pending}>
            {send.pending ? copy.confirm.working : copy.confirm.button}
          </SubmitButton>
        </form>
      </>
    )
  } else {
    body = (
      <p role='status' className='m-0 leading-relaxed'>
        {copy.loading}
      </p>
    )
  }

  return (
    <div className={WIDTH}>
      <section aria-labelledby='headline' className='md:grid md:grid-cols-12'>
        <div className='pt-6 md:col-span-3 md:pr-6'>
          <p className='label-mono m-0 text-foreground'>{copy.label}</p>
        </div>
        <div className='pt-4 pb-10 md:col-span-9 md:border-l md:border-border-strong md:pt-6 md:pb-16 md:pl-8'>
          <h1
            id='headline'
            className='m-0 max-w-[16ch] font-serif text-[clamp(2.75rem,8vw,6.5rem)] leading-[0.95] font-normal tracking-[-0.04em] text-balance'
          >
            {copy.label}
          </h1>
          <div className='mt-10 max-w-[36rem] border-t border-border-strong pt-6'>{body}</div>
        </div>
      </section>
    </div>
  )
}
