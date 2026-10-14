import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { presentSales } from '~/api/sales-messages'
import { useApp } from '~/app-context'
import { refresh, useRights } from '~/data/queries'
import { rightsWordingFor } from '~/data/rights-wording'
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
  const [ticked, setTicked] = useState(false)
  const [tickError, setTickError] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const status = rights.data
  const wording = status === undefined ? undefined : rightsWordingFor(status.currentWordingVersion)
  const shownVersion = status?.currentWordingVersion

  const confirm = useSubmit<void>(
    async () => {
      if (shownVersion === undefined) {
        return
      }
      setError(null)
      await app.salesHistory.confirmRights(shownVersion)
      await refresh(app, 'rights')
      setTicked(false)
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
        focusFirstError()
      },
    }
  )

  return (
    <>
      <h1>Rights confirmation</h1>
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
                confirm.submit()
              }}
            >
              <h2 id='rights-heading'>{wording.heading}</h2>
              <p className='hint'>Wording version {status.currentWordingVersion}</p>
              {wording.draft ? <p className='hint'>Draft wording, pending legal review.</p> : null}
              {wording.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {error ? (
                <Banner kind='error' innerRef={bannerRef}>
                  {error}
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
              <button type='submit' className='button' aria-disabled={confirm.pending}>
                {confirm.pending ? 'Confirming...' : 'Confirm'}
              </button>
            </form>
          )}
        </>
      )}
    </>
  )
}
