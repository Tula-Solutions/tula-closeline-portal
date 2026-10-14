import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { RightsWording } from 'tula-closeline-contract'
import { ApiError, CLIENT_ERRORS } from '~/api/errors'
import { presentSales } from '~/api/sales-messages'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { refresh, useRights } from '~/data/queries'
import { parseBackPath } from '~/data/sales-history'
import { Banner } from '~/ui/Banner'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'
import { When } from '~/ui/When'

const route = getRouteApi('/_app/sales-history/rights')

/** The rights confirmation: the wording, a tick, and who confirmed which version when. */
export function RightsScreen() {
  useDocumentTitle('Rights confirmation')
  const app = useApp()
  const navigate = useNavigate()
  // Checked again here, so no address but one of this section's pages is ever navigated to.
  const from = parseBackPath(route.useSearch().from)
  const rights = useRights(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const status = rights.data
  // The contract's own table decides; a text the service sends is only compared with it.
  const wording = status === undefined ? undefined : app.rightsWording(status.currentWordingVersion)
  const sent = status?.currentWording
  const disagrees = wording !== undefined && sent !== undefined && !sameWording(wording, sent)
  const reported = useRef(false)
  useEffect(() => {
    if (disagrees && !reported.current) {
      reported.current = true
      // Status and code only: the reporter carries no wording text.
      app.reporter.report(new ApiError({ code: CLIENT_ERRORS.badResponse, status: 200 }))
    }
  }, [disagrees, app])

  const confirm = useSubmit<number>(
    async (version) => {
      setError(null)
      // The version the person ticked under, not whatever is current by now.
      await app.salesHistory.confirmRights(version)
      // The confirmation is recorded whatever happens to this read: a failed refresh is the page's own error.
      await refresh(app, 'rights').catch(() => undefined)
      setNotice('Your confirmation is recorded.')
      if (from !== undefined) {
        await navigate({ to: from })
      }
    },
    {
      onError: (failure) => {
        setError(presentSales(failure, 'rights').message)
        // The wording may have moved on: read the current version again.
        void refresh(app, 'rights').catch(() => undefined)
      },
    }
  )

  return (
    <>
      <PageHeader title='Rights confirmation' />
      <p role='status' aria-label='Notice' className='notice'>
        {notice}
      </p>
      {rights.isPending ? (
        <p role='status' className='hint'>
          Loading...
        </p>
      ) : rights.isError || status === undefined ? (
        <>
          <Banner kind='error'>{presentSales(rights.error, 'rights').message}</Banner>
          <p>
            <button type='button' className='button button-quiet' onClick={() => rights.refetch()}>
              Try again
            </button>
          </p>
        </>
      ) : (
        <>
          {status.confirmation !== null ? (
            <p>
              {status.confirmed ? 'Rights confirmed' : 'Rights confirmed earlier'} for wording
              version {status.confirmation.wordingVersion} on{' '}
              <When iso={status.confirmation.confirmedAt} />.
              {status.confirmed
                ? ''
                : ` The wording is now version ${status.currentWordingVersion}, so confirm it again.`}
            </p>
          ) : null}
          {status.confirmed ? null : wording === undefined ? (
            <Banner kind='error'>
              Your Organization needs to confirm newer wording than this version of the portal has.
              Reload the page; if this stays, ask Tula Solutions.
            </Banner>
          ) : (
            <RightsForm
              key={status.currentWordingVersion}
              version={status.currentWordingVersion}
              wording={wording}
              error={error}
              pending={confirm.pending}
              onConfirm={confirm.submit}
            />
          )}
        </>
      )}
    </>
  )
}

/**
 * The wording, the tick and the button. The screen keys it by wording version, so a tick given
 * under one version is gone when another is current: a confirmation is only ever recorded for
 * wording the person ticked.
 */
export function RightsForm(props: {
  readonly version: number
  readonly wording: RightsWording
  readonly error: string | null
  readonly pending: boolean
  readonly onConfirm: (version: number) => void
}) {
  const { wording } = props
  const [ticked, setTicked] = useState(false)
  const [tickError, setTickError] = useState(false)
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  // A failure raised from outside (the service refused) moves focus to the banner.
  const shownError = useRef<string | null>(null)
  useEffect(() => {
    if (props.error !== null && props.error !== shownError.current) {
      focusFirstError()
    }
    shownError.current = props.error
  }, [props.error, focusFirstError])
  return (
    <form
      ref={formRef}
      noValidate
      aria-labelledby='rights-heading'
      onSubmit={(event) => {
        event.preventDefault()
        if (!ticked) {
          setTickError(true)
          focusFirstError()
          return
        }
        props.onConfirm(props.version)
      }}
    >
      <h2 id='rights-heading'>{wording.heading}</h2>
      <p className='hint'>Wording version {props.version}</p>
      {wording.draft ? <p className='hint'>Draft wording, pending legal review.</p> : null}
      {wording.paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {props.error ? (
        <Banner kind='error' innerRef={bannerRef}>
          {props.error}
        </Banner>
      ) : null}
      <div className='field'>
        <label htmlFor='rights-tick'>
          <input
            id='rights-tick'
            type='checkbox'
            checked={ticked}
            aria-invalid={tickError && !ticked ? 'true' : undefined}
            aria-describedby={tickError && !ticked ? 'rights-tick-error' : undefined}
            onChange={(event) => {
              setTicked(event.target.checked)
              setTickError(false)
            }}
          />{' '}
          {wording.checkbox}
        </label>
        {tickError && !ticked ? (
          <p className='field-error' id='rights-tick-error'>
            <strong>Error:</strong> Tick the box to confirm.
          </p>
        ) : null}
      </div>
      <button type='submit' className='button' aria-disabled={props.pending}>
        {props.pending ? 'Confirming...' : 'Confirm'}
      </button>
    </form>
  )
}

function sameWording(a: RightsWording, b: RightsWording): boolean {
  return (
    a.heading === b.heading &&
    a.checkbox === b.checkbox &&
    a.draft === b.draft &&
    a.paragraphs.length === b.paragraphs.length &&
    a.paragraphs.every((paragraph, index) => paragraph === b.paragraphs[index])
  )
}
