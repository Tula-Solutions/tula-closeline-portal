import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { PublicManagedBooking, PublicSlot } from 'tula-closeline-contract'
import { BOOKING_ERRORS, ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { fingerprint } from '~/api/idempotency'
import { presentPublicBooking } from '~/api/public-booking-messages'
import { useApp } from '~/app-context'
import { Button } from '~/components/ui/button'
import { Banner } from '~/ui/Banner'
import { SubmitButton } from '~/ui/SubmitButton'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'
import {
  H2,
  LINK,
  MODES,
  Row,
  SECTION,
  SlotPicker,
  useSlotQuery,
  visitorZone,
  whole,
} from './slot-picker'

const TITLE = 'Your Booking - Closeline'
const STATES = {
  confirmed: 'Confirmed',
  pending: 'Waiting for confirmation',
  cancelled: 'Cancelled',
}
/** How many times a move that is still running is asked again before the visitor is told to wait. */
const MAX_IN_PROGRESS_RETRIES = 3
/** The longest a visitor is made to wait on one such try, whatever `Retry-After` says. */
const MAX_WAIT_SECONDS = 10

type Closed = (error: unknown) => void

/** Picks a new time, confirms it, and moves the Booking with one Idempotency-Key per chosen time. */
function Reschedule(props: {
  readonly token: string
  readonly zone: string
  readonly onMoved: (booking: PublicManagedBooking) => void
  readonly onBack: () => void
  readonly onGone: () => void
  readonly onClosed: Closed
}) {
  const { token, zone } = props
  const app = useApp()
  const [reloads, setReloads] = useState(0)
  const [chosen, setChosen] = useState<PublicSlot | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { bannerRef, focusFirstError } = useFocusOnError()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const slots = useSlotQuery(['public-manage-slots', token], reloads, (query) =>
    app.publicBooking.listManagedSlots(token, query)
  )

  const move = useSubmit<PublicSlot>(
    async (slot) => {
      const body = { startsAt: slot.startsAt, timeZone: zone }
      const attempt = app.keys.begin(fingerprint.publicReschedule(token, slot.startsAt))
      try {
        for (let tries = 0; ; tries += 1) {
          try {
            const moved = await app.publicBooking.reschedule(token, body, attempt.key)
            attempt.succeeded()
            props.onMoved(moved)
            return
          } catch (failed) {
            const waiting =
              failed instanceof ApiError &&
              failed.code === ERRORS['request.idempotency_in_progress'].code &&
              tries < MAX_IN_PROGRESS_RETRIES
            if (!waiting) {
              throw failed
            }
            // The first try is still running: ask again with the same key after the wait it names.
            await app.sleep(Math.min(failed.retryAfterSeconds ?? 2, MAX_WAIT_SECONDS) * 1000)
          }
        }
      } catch (failed) {
        attempt.failed(failed)
        throw failed
      }
    },
    {
      onError(failed) {
        const shown = presentPublicBooking(failed)
        if (shown.kind === 'gone') {
          props.onGone()
        } else if (shown.kind === 'closed') {
          props.onClosed(failed)
        } else if (shown.kind === 'taken') {
          setChosen(null)
          setNotice(shown.message)
          setReloads((count) => count + 1)
        } else {
          setError(shown.message)
          focusFirstError()
        }
      },
    }
  )

  useEffect(() => {
    if (slots.error) {
      const shown = presentPublicBooking(slots.error)
      if (shown.kind === 'gone') {
        props.onGone()
      } else if (shown.kind === 'closed') {
        props.onClosed(slots.error)
      }
    }
  }, [slots.error, props.onGone, props.onClosed])

  useEffect(() => {
    if (chosen) {
      headingRef.current?.focus()
    }
  }, [chosen])

  if (!chosen) {
    return (
      <>
        <SlotPicker
          heading='Pick a new time'
          query={slots}
          zone={zone}
          notice={notice}
          onChoose={(slot) => {
            setNotice(null)
            setError(null)
            setChosen(slot)
          }}
        />
        <button
          type='button'
          className={`inline-flex min-h-11 items-center bg-transparent p-0 ${LINK}`}
          onClick={props.onBack}
        >
          Keep my current time
        </button>
      </>
    )
  }
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!move.pending) {
      setError(null)
      move.submit(chosen)
    }
  }
  return (
    <section className={SECTION} aria-labelledby='move-heading'>
      <h2 id='move-heading' ref={headingRef} tabIndex={-1} className={H2}>
        Move to this time?
      </h2>
      <p className='m-0 mt-3 leading-relaxed'>
        <time dateTime={chosen.startsAt}>{whole(chosen.startsAt, zone)}</time>
      </p>
      <button
        type='button'
        className={`mt-1 inline-flex min-h-11 items-center bg-transparent p-0 ${LINK}`}
        onClick={() => setChosen(null)}
      >
        Pick a different time
      </button>
      <form noValidate onSubmit={onSubmit} className='mt-4 max-w-[28rem]' aria-label='Move'>
        {error ? (
          <Banner kind='error' innerRef={bannerRef}>
            {error}
          </Banner>
        ) : null}
        <SubmitButton pending={move.pending}>
          {move.pending ? 'Moving' : 'Move my Booking'}
        </SubmitButton>
      </form>
    </section>
  )
}

/**
 * The public page behind a Booking's manage link: no sign-in, no app frame. The token in the address
 * is a bearer secret, so it is registered with the reporter and kept out of the title and out of
 * anything shown. Times are shown in the visitor's own zone.
 */
export function ManageBookingPage(props: { readonly token: string }) {
  const app = useApp()
  const { token } = props
  const client = useQueryClient()
  const zone = useMemo(visitorZone, [])
  const [gone, setGone] = useState(false)
  const [asking, setAsking] = useState(false)
  const [moving, setMoving] = useState(false)
  const [moved, setMoved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { bannerRef, focusFirstError } = useFocusOnError()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const key = useMemo(() => ['public-manage', token], [token])

  useEffect(() => {
    // The token is a secret in the address: no report may carry it.
    app.reporter.redact(token)
    const before = document.title
    document.title = TITLE
    return () => {
      document.title = before
    }
  }, [app, token])

  const booking = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => app.publicBooking.getManaged(token, signal),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  })
  const current = booking.data
  useEffect(() => {
    if (booking.error && presentPublicBooking(booking.error).kind === 'gone') {
      setGone(true)
    }
  }, [booking.error])

  const write = (next: PublicManagedBooking) => client.setQueryData(key, next)
  const onClosed: Closed = (failed) => {
    // Cancelled already: show it as the end state. Started: ask again for what the service says.
    if (failed instanceof ApiError && failed.code === BOOKING_ERRORS['booking.not_active'].code) {
      if (current) {
        write({ ...current, state: 'cancelled' })
      }
    } else {
      void booking.refetch()
    }
    setAsking(false)
    setMoving(false)
  }

  const cancel = useSubmit<void>(
    async () => {
      write(await app.publicBooking.cancel(token))
      setAsking(false)
      setMoved(false)
    },
    {
      onError(failed) {
        const shown = presentPublicBooking(failed)
        if (shown.kind === 'gone') {
          setGone(true)
        } else if (shown.kind === 'closed') {
          onClosed(failed)
        } else {
          setError(shown.message)
          focusFirstError()
        }
      },
    }
  )

  const started = current ? Date.parse(current.startsAt) <= Date.now() : false
  const cancelled = current?.state === 'cancelled'
  const view = gone
    ? 'gone'
    : !current
      ? 'loading'
      : cancelled
        ? 'cancelled'
        : started
          ? 'started'
          : asking
            ? 'asking'
            : moving
              ? 'moving'
              : 'open'
  const settled = useRef(false)
  useEffect(() => {
    if (view === 'loading') {
      return
    }
    // Focus follows the result of an action, not the first paint.
    if (settled.current) {
      headingRef.current?.focus()
    }
    settled.current = true
  }, [view])

  let body: React.ReactNode
  if (view === 'gone') {
    body = (
      <section className={SECTION}>
        <h2 ref={headingRef} tabIndex={-1} className={H2}>
          This link no longer works
        </h2>
        <p className='m-0 mt-3 max-w-[48ch] leading-relaxed'>
          It may be wrong or out of date. Ask the person who booked the time with you for help.
        </p>
      </section>
    )
  } else if (view === 'loading') {
    body = booking.isError ? (
      <section className={SECTION}>
        <Banner kind='error'>{presentPublicBooking(booking.error).message}</Banner>
        <button
          type='button'
          className={`inline-flex min-h-11 items-center bg-transparent p-0 ${LINK}`}
          onClick={() => void booking.refetch()}
        >
          Try again
        </button>
      </section>
    ) : (
      <p role='status' className={SECTION}>
        Loading your Booking.
      </p>
    )
  } else if (view === 'cancelled' || view === 'started') {
    body = (
      <section className={SECTION}>
        <h2 ref={headingRef} tabIndex={-1} className={H2}>
          {view === 'cancelled' ? 'This Booking is cancelled' : 'This Booking has already started'}
        </h2>
        <p className='m-0 mt-3 max-w-[48ch] leading-relaxed'>
          {view === 'cancelled'
            ? 'Nothing more is needed. To meet anyway, ask the person who sent the booking link for a new one.'
            : 'It can no longer be changed here.'}
        </p>
      </section>
    )
  } else if (view === 'asking') {
    body = (
      <section className={SECTION}>
        <h2 ref={headingRef} tabIndex={-1} className={H2}>
          Cancel this Booking?
        </h2>
        <p className='m-0 mt-3 max-w-[48ch] leading-relaxed'>
          The time above will be given up and the calendar invitation withdrawn.
        </p>
        <form
          noValidate
          aria-label='Cancel'
          className='mt-4 max-w-[28rem]'
          onSubmit={(event) => {
            event.preventDefault()
            setError(null)
            cancel.submit()
          }}
        >
          {error ? (
            <Banner kind='error' innerRef={bannerRef}>
              {error}
            </Banner>
          ) : null}
          <div className='flex flex-wrap items-center gap-4'>
            <SubmitButton pending={cancel.pending}>
              {cancel.pending ? 'Cancelling' : 'Yes, cancel it'}
            </SubmitButton>
            <button
              type='button'
              className={`inline-flex min-h-11 items-center bg-transparent p-0 ${LINK}`}
              onClick={() => {
                setAsking(false)
                setError(null)
              }}
            >
              Keep it
            </button>
          </div>
        </form>
      </section>
    )
  } else if (view === 'moving') {
    body = (
      <Reschedule
        token={token}
        zone={zone}
        onMoved={(next) => {
          write(next)
          setMoving(false)
          setMoved(true)
        }}
        onBack={() => setMoving(false)}
        onGone={() => setGone(true)}
        onClosed={onClosed}
      />
    )
  } else {
    body = (
      <section className={SECTION}>
        <h2 ref={headingRef} tabIndex={-1} className={H2}>
          {moved ? 'Your Booking is moved' : 'Change this Booking'}
        </h2>
        <div className='mt-4 flex flex-wrap items-center gap-4'>
          <Button
            type='button'
            variant='outline'
            onClick={() => {
              setMoved(false)
              setMoving(true)
            }}
          >
            Choose another time
          </Button>
          <button
            type='button'
            className={`inline-flex min-h-11 items-center bg-transparent p-0 ${LINK}`}
            onClick={() => {
              setMoved(false)
              setError(null)
              setAsking(true)
            }}
          >
            Cancel this Booking
          </button>
        </div>
      </section>
    )
  }

  return (
    <main className='mx-auto min-h-dvh max-w-[56rem] px-4 pt-6 pb-16 sm:px-8'>
      <header className='pb-8'>
        <p className='label-mono m-0 text-foreground'>Closeline · Your Booking</p>
        <h1 className='m-0 mt-6 font-serif text-[clamp(2.25rem,7vw,4.5rem)] leading-[0.98] font-normal tracking-[-0.03em] text-balance'>
          {current && !gone ? current.bookingType.name : 'Your Booking'}
        </h1>
        {current && !gone ? (
          <dl className='mt-6 mb-0'>
            <Row label='When'>
              <time dateTime={current.startsAt}>{whole(current.startsAt, zone)}</time>
            </Row>
            <Row label='How'>{MODES[current.mode]}</Row>
            {current.joinUrl && !cancelled ? (
              <Row label='Join'>
                {/* No referrer: the address you came from holds the secret token. */}
                <a href={current.joinUrl} rel='noopener noreferrer' className={LINK}>
                  {current.joinUrl}
                </a>
              </Row>
            ) : null}
            <Row label='Status'>
              {started && !cancelled ? 'Already started' : STATES[current.state]}
            </Row>
          </dl>
        ) : null}
      </header>
      {body}
    </main>
  )
}
