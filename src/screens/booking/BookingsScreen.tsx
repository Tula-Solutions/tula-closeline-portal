import { useCallback, useRef, useState } from 'react'
import { BOOKING_ERRORS, type Booking, type Role } from 'tula-closeline-contract'
import { ofRep } from '~/api/bookings'
import { presentBooking } from '~/api/bookings-messages'
import { ApiError } from '~/api/errors'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { Section } from '~/components/app/section'
import { can } from '~/data/permissions'
import { prospectName } from '~/data/prospects'
import {
  refresh,
  useBookingSlots,
  useBookings,
  useBookingTypes,
  useMembersByIds,
  useProspect,
} from '~/data/queries'
import { useRole } from '~/data/session-role'
import { Confirm } from '~/ui/Confirm'
import { Paged } from '~/ui/Paged'
import { SelectField } from '~/ui/SelectField'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useClearOnSuccess, useFeedback } from '~/ui/useFeedback'
import { useSubmit } from '~/ui/useSubmit'
import { formatWhen, When } from '~/ui/When'

/** Core lists a free time range of at most this many days. */
const SLOT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

const SCOPE_WORDS: Record<Role, string> = {
  owner: 'Every Booking in the Organization, by every Rep.',
  admin: 'Every Booking in the Organization, by every Rep.',
  manager: "The Bookings of your Team's Reps.",
  rep: 'Your own Bookings.',
}

const ORIGIN_WORDS = {
  member: 'Booked by a member',
  agent: 'Booked by the Inbound Agent',
  public: 'Booked on the public page',
} as const

const STATE_WORDS = { pending: 'Pending', confirmed: 'Confirmed', cancelled: 'Cancelled' } as const

/** The Bookings core shows the viewer, upcoming and past, with cancel and reschedule on the upcoming ones. */
export function BookingsScreen() {
  useDocumentTitle('Bookings')
  const role = useRole()
  const feedback = useFeedback()
  // Fixed for the visit, so "upcoming" and "past" do not shift under the page being read.
  const [boundary] = useState(() => new Date().toISOString())
  const upcoming = useBookings('upcoming', boundary)
  const past = useBookings('past', boundary)
  const types = useBookingTypes(true)
  const typeNames = new Map(types.items.map((type) => [type.id, type.name]))
  if (role === null) {
    return null
  }
  const row = (booking: Booking, actions: boolean) => (
    <BookingItem
      key={booking.id}
      booking={booking}
      role={role}
      typeName={typeNames.get(booking.bookingTypeId)}
      actions={actions}
      onDone={feedback.done}
      onFail={feedback.failed}
      serial={feedback.serial}
    />
  )
  return (
    <>
      <PageHeader eyebrow='Sales' title='Bookings' description={SCOPE_WORDS[role]} />
      <div className='flex min-w-0 flex-col gap-10'>
        <p role='status' className='notice'>
          {feedback.notice}
        </p>
        <Section id='upcoming-bookings' title='Upcoming'>
          <Paged
            noun='Bookings'
            emptyText='There are no upcoming Bookings.'
            emptyHint='A Booking made on a public link or by an Agent shows here.'
            state={upcoming.state}
            present={presentBooking}
          >
            <ul
              className='m-0 list-none divide-y border-y p-0 motion-safe:animate-fade'
              aria-label='Upcoming Bookings'
            >
              {upcoming.items.map((booking) => row(booking, true))}
            </ul>
          </Paged>
        </Section>
        <Section id='past-bookings' title='Past'>
          <Paged
            noun='Bookings'
            emptyText='There are no past Bookings.'
            state={past.state}
            present={presentBooking}
          >
            <ul
              className='m-0 list-none divide-y border-y p-0 motion-safe:animate-fade'
              aria-label='Past Bookings'
            >
              {past.items.map((booking) => row(booking, false))}
            </ul>
          </Paged>
        </Section>
      </div>
    </>
  )
}

/** The Prospect's name, read from core; one call per visible row. */
function ProspectName(props: { readonly prospectId: string }) {
  const prospect = useProspect(props.prospectId)
  if (prospect.data === undefined) {
    return <>{prospect.isError ? 'A Prospect' : '...'}</>
  }
  return <Untrusted value={prospectName(prospect.data)} />
}

function RepName(props: { readonly role: Role; readonly membershipId: string }) {
  const seeMembers = can.viewMembers(props.role)
  const members = useMembersByIds([props.membershipId], seeMembers)
  if (props.role === 'rep') {
    return <>You</>
  }
  const member = members.get(props.membershipId)
  return member === undefined ? <>a Rep</> : <Untrusted value={member.name ?? member.email} />
}

function BookingItem(props: {
  readonly booking: Booking
  readonly role: Role
  readonly typeName: string | undefined
  readonly actions: boolean
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
  readonly serial: number
}) {
  const { booking } = props
  const app = useApp()
  const [error, setError] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const moveButton = useRef<HTMLButtonElement>(null)
  const errorId = `${booking.id}-error`
  const label = `the Booking on ${formatWhen(booking.startsAt)}`
  const clearError = useCallback(() => setError(null), [])
  useClearOnSuccess(props.serial, clearError)
  const cancel = useSubmit<void>(
    async () => {
      setError(null)
      await app.bookings.cancel(booking.id)
      await refresh(app, 'bookings')
      props.onDone('Booking cancelled.')
    },
    {
      async onError(failure) {
        props.onFail()
        setError(presentBooking(failure).message)
        if (
          failure instanceof ApiError &&
          failure.code === BOOKING_ERRORS['booking.not_found'].code
        ) {
          await refresh(app, 'bookings')
        }
      },
    }
  )
  const open = props.actions && booking.state !== 'cancelled'
  return (
    <li className='py-4'>
      <div className='list-item-head'>
        <div className='flex min-w-0 flex-col'>
          <h3 className='item-title m-0 font-serif text-xl font-normal tracking-[-0.01em]'>
            <When iso={booking.startsAt} />
          </h3>
          <span className='label-mono mt-1 block'>
            {props.typeName === undefined ? 'Booking' : <Untrusted value={props.typeName} />} ·{' '}
            {booking.mode === 'video' ? 'Video' : 'Phone'} · {STATE_WORDS[booking.state]} ·{' '}
            {ORIGIN_WORDS[booking.origin]}
          </span>
          <span className='hint'>
            With <ProspectName prospectId={booking.prospectId} />, for{' '}
            <RepName role={props.role} membershipId={booking.repMembershipId} />
          </span>
        </div>
        {open ? (
          <div className='row-actions'>
            <button
              type='button'
              ref={moveButton}
              className='button button-quiet'
              aria-label={`Reschedule ${label}`}
              aria-expanded={moving}
              aria-controls={moving ? `${booking.id}-move` : undefined}
              onClick={() => setMoving((now) => !now)}
            >
              Reschedule
            </button>
            <Confirm
              label='Cancel'
              accessibleName={`Cancel ${label}`}
              pendingAccessibleName={`Cancelling ${label}`}
              pendingLabel='Cancelling...'
              question='Cancel this Booking? The Prospect is not told by the portal.'
              tone='quiet-destructive'
              confirmLabel='Cancel Booking'
              pending={cancel.pending}
              describedBy={error ? errorId : undefined}
              onConfirm={() => cancel.submit()}
            />
          </div>
        ) : null}
      </div>
      {error ? (
        <p className='field-error' id={errorId} role='alert'>
          <strong>Error:</strong> {error}
        </p>
      ) : null}
      {open && moving ? (
        <MovePanel
          booking={booking}
          onDone={(notice) => {
            setMoving(false)
            props.onDone(notice)
            setTimeout(() => moveButton.current?.focus(), 0)
          }}
          onFail={props.onFail}
          onClose={() => {
            setMoving(false)
            setTimeout(() => moveButton.current?.focus(), 0)
          }}
        />
      ) : null}
    </li>
  )
}

/** Picks a new time from the free times of the Booking's own Rep, then asks core to move it. */
function MovePanel(props: {
  readonly booking: Booking
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
  readonly onClose: () => void
}) {
  const { booking } = props
  const app = useApp()
  const [window] = useState(() => {
    const from = new Date()
    return { from: from.toISOString(), to: new Date(from.getTime() + SLOT_WINDOW_MS).toISOString() }
  })
  const slots = useBookingSlots(
    { bookingTypeId: booking.bookingTypeId, prospectId: booking.prospectId, ...window },
    true
  )
  const [chosen, setChosen] = useState('')
  const [error, setError] = useState<string | undefined>()
  const mine = ofRep(slots.items, booking.repMembershipId)
  const move = useSubmit<string>(
    async (startsAt) => {
      setError(undefined)
      await app.bookings.reschedule(booking.id, startsAt)
      await refresh(app, 'bookings')
      props.onDone('Booking moved.')
    },
    {
      async onError(failure) {
        props.onFail()
        setError(presentBooking(failure).message)
        setChosen('')
        if (failure instanceof ApiError) {
          const code = failure.code
          if (
            code === BOOKING_ERRORS['booking.not_active'].code ||
            code === BOOKING_ERRORS['booking.not_found'].code ||
            code === BOOKING_ERRORS['booking.slot_taken'].code
          ) {
            await refresh(app, 'bookings')
          }
        }
      },
    }
  )
  return (
    <div
      id={`${booking.id}-move`}
      className='mt-3 border-l-2 border-rule-strong pl-4 motion-safe:animate-rise'
    >
      <Paged
        noun='times'
        emptyText='There are no free times for this Rep in the next 14 days.'
        state={slots.state}
        present={presentBooking}
      >
        <SelectField
          label='New time'
          name={`${booking.id}-time`}
          placeholder='Choose a time'
          value={chosen}
          options={mine.map((slot) => ({ value: slot.startsAt, text: formatWhen(slot.startsAt) }))}
          error={error}
          onChange={(event) => setChosen(event.target.value)}
        />
        {mine.length === 0 && slots.state.hasNextPage ? (
          <p className='hint'>This Rep has no times on the pages read so far.</p>
        ) : null}
      </Paged>
      <div className='row-actions'>
        <button
          type='button'
          className='button'
          aria-disabled={move.pending || chosen === ''}
          onClick={() => {
            if (chosen !== '' && !move.pending) {
              move.submit(chosen)
            }
          }}
        >
          {move.pending ? 'Moving...' : 'Move Booking'}
        </button>
        <button type='button' className='button button-quiet' onClick={props.onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
