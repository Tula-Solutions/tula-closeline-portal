import { useInfiniteQuery } from '@tanstack/react-query'
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
import { Button } from '~/components/ui/button'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
import { SubmitButton } from '~/ui/SubmitButton'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'

const MAX_RANGE_DAYS = 14
const DAY_MS = 86_400_000
const PAGE_LIMIT = 60
const TITLE = 'Book a time - Closeline'

const MODES = { phone: 'Phone call', video: 'Video call' } as const
const SECTION = 'border-t border-border-strong pt-6 pb-8'
const H2 = 'm-0 font-serif text-2xl tracking-[-0.02em] outline-hidden'
const LINK =
  'rounded-sm underline decoration-border-strong decoration-1 underline-offset-4 outline-hidden hover:decoration-current focus-visible:ring-2 focus-visible:ring-ring'

/** The visitor's own time zone from the browser, or UTC when the browser gives a name the contract would refuse. */
function visitorZone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/.test(zone) ? zone : 'UTC'
}

/** The longest range the API allows, starting now (whole seconds, so the two ends are plain timestamps). */
function nextRange() {
  const from = Math.floor(Date.now() / 1000) * 1000
  const stamp = (time: number) => new Date(time).toISOString().replace('.000Z', 'Z')
  return { from: stamp(from), to: stamp(from + MAX_RANGE_DAYS * DAY_MS) }
}

type Group = { readonly key: string; readonly label: string; readonly slots: PublicSlot[] }

/** Free times grouped by their day in `zone`, in the order given (the API sends earliest first). */
function groupByDay(slots: readonly PublicSlot[], zone: string): Group[] {
  const key = new Intl.DateTimeFormat('en-CA', { timeZone: zone })
  const label = new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const groups: Group[] = []
  for (const slot of slots) {
    const at = Date.parse(slot.startsAt)
    const day = key.format(at)
    const last = groups.at(-1)
    if (last?.key === day) {
      last.slots.push(slot)
    } else {
      groups.push({ key: day, label: label.format(at), slots: [slot] })
    }
  }
  return groups
}

/** A time of day in `zone`, such as "10:30 AM". */
function clock(iso: string, zone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(Date.parse(iso))
}

/** A whole date and time in `zone`, such as "Tuesday, November 3, 10:30 AM". */
function whole(iso: string, zone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(Date.parse(iso))
}

/** One row of a ledger: a small label and its value. */
function Row(props: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className='dl-group'>
      <dt>{props.label}</dt>
      <dd className='break-words'>{props.children}</dd>
    </div>
  )
}

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
  const range = useMemo(() => {
    void reloads
    return nextRange()
  }, [reloads])
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

  const slots = useInfiniteQuery({
    queryKey: ['public-booking-slots', token, range.from, reloads],
    queryFn: ({ pageParam, signal }) =>
      app.publicBooking.listSlots(token, {
        ...range,
        cursor: pageParam,
        limit: PAGE_LIMIT,
        signal,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  })
  const bookingType = slots.data?.pages[0]?.bookingType
  const groups = useMemo(
    () => groupByDay(slots.data?.pages.flatMap((page) => page.items) ?? [], zone),
    [slots.data, zone]
  )

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
    let times: React.ReactNode
    if (slots.isError) {
      const shown = presentPublicBooking(slots.error)
      times = (
        <>
          <Banner kind={shown.kind === 'no_times' ? 'info' : 'error'}>{shown.message}</Banner>
          {shown.kind === 'no_times' ? null : (
            <button
              type='button'
              className={`inline-flex min-h-11 items-center bg-transparent p-0 ${LINK}`}
              onClick={() => void slots.refetch()}
            >
              Try again
            </button>
          )}
        </>
      )
    } else if (slots.isPending) {
      times = (
        <p role='status' className='m-0'>
          Loading times.
        </p>
      )
    } else if (groups.length === 0) {
      times = (
        <p role='status' className='m-0 max-w-[48ch] leading-relaxed'>
          No times are free in the next {MAX_RANGE_DAYS} days. Check back later.
        </p>
      )
    } else {
      times = (
        <>
          {groups.map((group) => (
            <section
              key={group.key}
              aria-labelledby={`day-${group.key}`}
              className='border-b border-border py-4 md:grid md:grid-cols-[14rem_1fr] md:gap-6'
            >
              <h3 id={`day-${group.key}`} className='label-mono m-0 pt-3 text-foreground'>
                {group.label}
              </h3>
              <ul className='m-0 mt-2 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-4 md:mt-0'>
                {group.slots.map((slot) => (
                  <li key={slot.startsAt}>
                    <Button
                      type='button'
                      variant='outline'
                      className='w-full tabular-nums'
                      onClick={() => {
                        setNotice(null)
                        setChosen(slot)
                      }}
                    >
                      <time dateTime={slot.startsAt}>{clock(slot.startsAt, zone)}</time>
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {slots.hasNextPage ? (
            <Button
              type='button'
              variant='link'
              className='mt-3 h-11'
              aria-disabled={slots.isFetchingNextPage}
              onClick={() => {
                if (!slots.isFetchingNextPage) {
                  void slots.fetchNextPage()
                }
              }}
            >
              {slots.isFetchingNextPage ? 'Loading' : 'Later times'}
            </Button>
          ) : null}
        </>
      )
    }
    body = (
      <section className={SECTION} aria-labelledby='times-heading'>
        <h2 id='times-heading' className={H2}>
          Pick a time
        </h2>
        <p className='m-0 mt-1 mb-4 text-sm text-muted-foreground'>
          Times are shown in your time zone, <span className='tabular-nums'>{zone}</span>.
        </p>
        {notice ? <Banner kind='info'>{notice.message}</Banner> : null}
        {times}
      </section>
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
            <dl className='mt-6'>
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
