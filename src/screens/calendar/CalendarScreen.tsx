import { useNavigate } from '@tanstack/react-router'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { BOOKING_ERRORS } from 'tula-closeline-contract'
import { presentCalendar } from '~/api/calendar-messages'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { Section } from '~/components/app/section'
import { refreshCalendar, useCalendarConnection } from '~/data/queries'
import { HoursSection } from '~/screens/calendar/HoursSection'
import { Banner } from '~/ui/Banner'
import { Confirm } from '~/ui/Confirm'
import { Field } from '~/ui/Field'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useFeedback } from '~/ui/useFeedback'
import { useSubmit } from '~/ui/useSubmit'
import { When } from '~/ui/When'

/** What Google put in the return address: the one-time code and the `state` from the start, or a refusal. */
export type CalendarReturn = {
  readonly code?: string | undefined
  readonly state?: string | undefined
  readonly error?: string | undefined
}

/** Where a Rep connects their calendar, sees whether it still works and sets their weekly hours; every role has its own. */
export function CalendarScreen(props: { readonly returned?: CalendarReturn | undefined }) {
  useDocumentTitle('Calendar and hours')
  const feedback = useFeedback()
  return (
    <>
      <PageHeader
        eyebrow='Sales'
        title='Calendar and hours'
        description='Your own calendar and the hours you take meetings. Closeline books a Prospect only into free time inside those hours, and no one else can change them for you.'
      />
      <div className='flex flex-col gap-12'>
        <p role='status' className='notice'>
          {feedback.notice}
        </p>
        <ConnectionSection
          returned={props.returned}
          onDone={feedback.done}
          onFail={feedback.failed}
        />
        <HoursSection onDone={feedback.done} onFail={feedback.failed} />
      </div>
    </>
  )
}

const hasReturn = (returned: CalendarReturn | undefined) =>
  returned !== undefined &&
  (returned.code !== undefined || returned.state !== undefined || returned.error !== undefined)

function ConnectionSection(props: {
  readonly returned: CalendarReturn | undefined
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const app = useApp()
  const navigate = useNavigate()
  const connection = useCalendarConnection()
  const [error, setError] = useState<string | undefined>()
  const [local, setLocal] = useState<{ readonly address: string; readonly state: string }>()
  const handled = useRef(false)
  const finish = useSubmit<{ readonly state: string; readonly code: string }>(
    async ({ state, code }) => {
      await app.calendar.complete(state, code)
      setError(undefined)
      setLocal(undefined)
      await refreshCalendar(app)
      props.onDone('Your calendar is connected.')
    },
    {
      onError(failure) {
        props.onFail()
        setError(presentCalendar(failure).message)
      },
    }
  )
  const start = useSubmit<undefined>(
    async () => {
      const { authorizationUrl, state } = await app.calendar.start()
      if (new URL(authorizationUrl).protocol !== 'https:') {
        throw new Error('unsafe consent address')
      }
      setError(undefined)
      if (app.env.environment === 'local') {
        setLocal({ address: authorizationUrl, state })
        return
      }
      app.assign(authorizationUrl)
    },
    {
      onError(failure) {
        props.onFail()
        setError(
          failure instanceof Error && failure.message === 'unsafe consent address'
            ? BOOKING_ERRORS['calendar.authorization_failed'].message
            : presentCalendar(failure).message
        )
      },
    }
  )
  const disconnect = useSubmit<undefined>(
    async () => {
      await app.calendar.disconnect()
      setError(undefined)
      await refreshCalendar(app)
      props.onDone('Your calendar is disconnected. Future Bookings stay on it.')
    },
    {
      onError(failure) {
        props.onFail()
        setError(presentCalendar(failure).message)
      },
    }
  )

  // The return from Google: take the code and state out of the address at once, then complete.
  const { returned } = props
  const { submit: complete } = finish
  useEffect(() => {
    if (handled.current || !hasReturn(returned)) {
      return
    }
    handled.current = true
    void navigate({ to: '/calendar/callback', search: {}, replace: true })
    if (returned?.code && returned.state) {
      complete({ state: returned.state, code: returned.code })
    } else {
      setError(BOOKING_ERRORS['calendar.authorization_failed'].message)
    }
  }, [returned, navigate, complete])

  const action = connection.data?.state === 'needs_reconnect' ? 'Reconnect' : 'Connect'
  const onPaste = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const code = new FormData(event.currentTarget).get('code')
    if (local && typeof code === 'string' && code.trim() !== '') {
      finish.submit({ state: local.state, code: code.trim() })
    }
  }
  return (
    <Section
      id='calendar'
      title='Calendar'
      description='Google Calendar. Closeline reads when you are busy and writes the meetings it books. It never shows a Prospect anything but the free times.'
    >
      {error === undefined ? null : <Banner kind='error'>{error}</Banner>}
      {connection.isPending ? (
        <p role='status' className='notice'>
          Loading your calendar...
        </p>
      ) : connection.isError ? (
        <>
          <Banner kind='error'>{presentCalendar(connection.error).message}</Banner>
          <button type='button' className='button' onClick={() => void connection.refetch()}>
            Try again
          </button>
        </>
      ) : (
        <div className='border-y'>
          <div className='flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 py-3'>
            {connection.data === null ? (
              <p className='m-0'>
                <strong>Not connected</strong>
                <span className='hint block'>
                  Without a calendar, you cannot be offered for a meeting.
                </span>
              </p>
            ) : (
              <p className='m-0'>
                <strong>
                  {connection.data.state === 'healthy' ? 'Healthy' : 'Needs reconnecting'}
                </strong>{' '}
                · Google Calendar
                <span className='hint block'>
                  Connected <When iso={connection.data.connectedAt} />
                  {connection.data.lastCheckedAt ? (
                    <>
                      , last checked <When iso={connection.data.lastCheckedAt} />
                    </>
                  ) : (
                    ', not checked yet'
                  )}
                </span>
              </p>
            )}
            <div className='row-actions'>
              {connection.data === null || connection.data.state === 'needs_reconnect' ? (
                <button
                  type='button'
                  className='button'
                  aria-disabled={start.pending}
                  onClick={() => start.submit(undefined)}
                >
                  {start.pending ? 'Opening Google...' : `${action} Google Calendar`}
                </button>
              ) : null}
              {connection.data === null ? null : (
                <Confirm
                  label='Disconnect'
                  accessibleName='Disconnect calendar'
                  pendingAccessibleName='Disconnecting calendar'
                  pendingLabel='Disconnecting...'
                  question='Closeline stops reading your calendar and drops its access. Bookings already on your calendar stay there, and you are not offered for new meetings until you connect again.'
                  confirmLabel='Disconnect calendar'
                  pending={disconnect.pending}
                  onConfirm={() => disconnect.submit(undefined)}
                  tone='quiet-destructive'
                />
              )}
            </div>
          </div>
          {connection.data?.state === 'needs_reconnect' ? (
            <p className='m-0 border-t py-3'>
              Google no longer accepts the access you gave. Until you reconnect, Closeline cannot
              see when you are busy, so you are not offered for new meetings.
            </p>
          ) : null}
        </div>
      )}
      {local ? (
        <form onSubmit={onPaste} noValidate className='mt-6 max-w-xl gap-0 border-t pt-4'>
          <p className='mt-0'>
            <strong>This is the local stack.</strong> Google cannot send you back here. Open the
            consent page, then paste the code it returns to finish.
          </p>
          <p className='hint'>
            <a href={local.address} rel='noreferrer' target='_blank'>
              Open the consent page
            </a>
          </p>
          <Field label='Code from Google' name='code' autoComplete='off' spellCheck={false} />
          <div className='row-actions'>
            <button type='submit' className='button' aria-disabled={finish.pending}>
              {finish.pending ? 'Connecting...' : 'Finish connecting'}
            </button>
            <button
              type='button'
              className='button button-quiet'
              onClick={() => setLocal(undefined)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </Section>
  )
}
