import { Link } from '@tanstack/react-router'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  type PublicBookingConfirmation,
  type PublicSlot,
  publicBookRequestSchema,
} from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { fingerprint } from '~/api/idempotency'
import { type PublicBookingFailure, presentPublicBooking } from '~/api/public-booking-messages'
import { useApp } from '~/app-context'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
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

const TITLE = 'Book a time - Closeline'

/** The form's off-screen trap for bots: out of sight, out of the tab order and out of the accessibility tree. */
function Honeypot(props: { readonly value: string; readonly onChange: (value: string) => void }) {
  return (
    <div aria-hidden='true' className='absolute top-auto -left-[10000px] h-px w-px overflow-hidden'>
      <label>
        Website
        <input
          type='text'
          name='website'
          tabIndex={-1}
          autoComplete='off'
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
      </label>
    </div>
  )
}

type DetailsErrors = { name?: string; email?: string; form?: string }

/**
 * The public page for a Booking Type link: no sign-in, no app frame. The token in the address is a
 * secret, so it is registered with the reporter, kept out of the title and out of anything shown, and
 * never logged. Times are shown in the visitor's own zone; the booking is sent with an Idempotency-Key
 * that a retry of the same details reuses.
 */
export function PublicBookingPage(props: { readonly token: string }) {
  const app = useApp()
  const { token } = props
  const zone = useMemo(visitorZone, [])
  const [reloads, setReloads] = useState(0)
  const [chosen, setChosen] = useState<PublicSlot | null>(null)
  const [confirmation, setConfirmation] = useState<PublicBookingConfirmation | null>(null)
  const [notice, setNotice] = useState<PublicBookingFailure | null>(null)
  const [cooling, setCooling] = useState(false)
  const [gone, setGone] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [errors, setErrors] = useState<DetailsErrors>({})
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    // The token is a secret in the address: no report may carry it.
    app.reporter.redact(token)
    const before = document.title
    document.title = TITLE
    return () => {
      document.title = before
    }
  }, [app, token])

  const slots = useSlotQuery(['public-booking-slots', token], reloads, (query) =>
    app.publicBooking.listSlots(token, query)
  )
  const bookingType = slots.data?.pages[0]?.bookingType

  const book = useSubmit<PublicSlot>(
    async (slot) => {
      const parsed = publicBookRequestSchema.parse({
        name,
        email,
        startsAt: slot.startsAt,
        timeZone: zone,
        website,
      })
      const attempt = app.keys.begin(fingerprint.publicBooking(token, JSON.stringify(parsed)))
      try {
        const result = await app.publicBooking.book(token, parsed, attempt.key)
        attempt.succeeded()
        app.reporter.redact(result.manageToken)
        setConfirmation(result)
      } catch (error) {
        attempt.failed(error)
        throw error
      }
    },
    {
      onError(error) {
        const shown = presentPublicBooking(error)
        if (shown.kind === 'gone') {
          setGone(true)
          return
        }
        if (shown.kind === 'taken') {
          setChosen(null)
          setNotice(shown)
          setReloads((count) => count + 1)
          return
        }
        if (shown.kind === 'busy') {
          setCooling(true)
          const seconds = error instanceof ApiError ? (error.retryAfterSeconds ?? 30) : 30
          void app.sleep(seconds * 1000).then(() => setCooling(false))
        }
        setErrors({ form: shown.message })
        focusFirstError()
      },
    }
  )

  useEffect(() => {
    if (slots.error && presentPublicBooking(slots.error).kind === 'gone') {
      setGone(true)
    }
  }, [slots.error])

  // Move focus to the new view's heading when the view changes.
  const view = gone ? 'gone' : confirmation ? 'done' : chosen ? 'form' : 'times'
  useEffect(() => {
    if (view !== 'times') {
      headingRef.current?.focus()
    }
  }, [view])

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!chosen || book.pending || cooling) {
      return
    }
    const parsed = publicBookRequestSchema.safeParse({
      name,
      email,
      startsAt: chosen.startsAt,
      timeZone: zone,
      website,
    })
    if (!parsed.success) {
      const next: DetailsErrors = {}
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'name') {
          next.name = 'Enter your name.'
        } else if (issue.path[0] === 'email') {
          next.email = 'Enter a valid work email address.'
        }
      }
      setErrors(next)
      focusFirstError()
      return
    }
    setErrors({})
    book.submit(chosen)
  }

  let body: React.ReactNode
  if (gone) {
    body = (
      <section className={SECTION}>
        <h2 ref={headingRef} tabIndex={-1} className={H2}>
          This booking link no longer works
        </h2>
        <p className='m-0 mt-3 max-w-[48ch] leading-relaxed'>
          It may have been replaced or switched off. Ask the person who sent it for a new one.
        </p>
      </section>
    )
  } else if (confirmation) {
    body = (
      <section className={SECTION}>
        <h2 ref={headingRef} tabIndex={-1} className={H2}>
          You are booked
        </h2>
        <dl className='mt-6'>
          <Row label='When'>
            <time dateTime={confirmation.startsAt}>{whole(confirmation.startsAt, zone)}</time>
          </Row>
          <Row label='How'>{MODES[confirmation.mode]}</Row>
          {confirmation.joinUrl ? (
            <Row label='Join'>
              {/* No referrer: the address you came from holds the secret token. */}
              <a href={confirmation.joinUrl} rel='noopener noreferrer' className={LINK}>
                {confirmation.joinUrl}
              </a>
            </Row>
          ) : null}
        </dl>
        <p className='m-0 mt-6 max-w-[52ch] leading-relaxed'>
          The calendar invitation comes from the calendar, not from Closeline. Look for it at the
          email address you gave.
        </p>
        <p className='m-0 mt-4 max-w-[52ch] leading-relaxed'>
          To see, move or cancel this Booking, use{' '}
          <Link
            to='/book/manage/$token'
            params={{ token: confirmation.manageToken }}
            className={LINK}
          >
            Manage this Booking
          </Link>
          . Keep that link: it is the only way back, and anyone who has it can change the Booking.
        </p>
      </section>
    )
  } else if (chosen) {
    body = (
      <section className={SECTION} aria-labelledby='details-heading'>
        <h2 id='details-heading' ref={headingRef} tabIndex={-1} className={H2}>
          Your details
        </h2>
        <p className='m-0 mt-3 leading-relaxed'>
          <time dateTime={chosen.startsAt}>{whole(chosen.startsAt, zone)}</time>
          {bookingType ? `, ${bookingType.lengthMinutes} minutes` : ''}
        </p>
        <button
          type='button'
          className={`mt-1 inline-flex min-h-11 items-center bg-transparent p-0 ${LINK}`}
          onClick={() => {
            setChosen(null)
            setErrors({})
          }}
        >
          Choose another time
        </button>
        <form
          ref={formRef}
          noValidate
          onSubmit={onSubmit}
          className='relative mt-4 max-w-[28rem]'
          aria-label='Your details'
        >
          {errors.form ? (
            <Banner kind='error' innerRef={bannerRef}>
              {errors.form}
            </Banner>
          ) : null}
          <Field
            label='Name'
            name='name'
            autoComplete='name'
            value={name}
            error={errors.name}
            onChange={(event) => setName(event.target.value)}
          />
          <Field
            label='Work email'
            name='email'
            type='email'
            autoComplete='email'
            value={email}
            error={errors.email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Honeypot value={website} onChange={setWebsite} />
          <SubmitButton pending={book.pending || cooling}>
            {book.pending ? 'Booking' : 'Book this time'}
          </SubmitButton>
        </form>
      </section>
    )
  } else {
    body = (
      <SlotPicker
        heading='Pick a time'
        query={slots}
        zone={zone}
        notice={notice?.message ?? null}
        onChoose={(slot) => {
          setNotice(null)
          setChosen(slot)
        }}
      />
    )
  }

  return (
    <main className='mx-auto min-h-dvh max-w-[56rem] px-4 pt-6 pb-16 sm:px-8'>
      <header className='pb-8'>
        <p className='label-mono m-0 text-foreground'>Closeline · Book a time</p>
        {bookingType && !gone ? (
          <>
            <h1 className='m-0 mt-6 font-serif text-[clamp(2.25rem,7vw,4.5rem)] leading-[0.98] font-normal tracking-[-0.03em] text-balance'>
              {bookingType.name}
            </h1>
            <dl className='mt-6 mb-0'>
              <Row label='Length'>{bookingType.lengthMinutes} minutes</Row>
              <Row label='How'>{MODES[bookingType.mode]}</Row>
            </dl>
          </>
        ) : (
          <h1 className='m-0 mt-6 font-serif text-[clamp(2.25rem,7vw,4.5rem)] leading-[0.98] font-normal tracking-[-0.03em]'>
            Book a time
          </h1>
        )}
      </header>
      {body}
    </main>
  )
}
