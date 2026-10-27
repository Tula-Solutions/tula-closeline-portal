import { type FormEvent, useState } from 'react'
import {
  type Availability,
  availabilitySchema,
  MAX_WINDOWS_PER_DAY,
  WEEKDAYS,
  type Weekday,
} from 'tula-closeline-contract'
import { presentCalendar } from '~/api/calendar-messages'
import { useApp } from '~/app-context'
import { Section } from '~/components/app/section'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { refresh, useAvailability } from '~/data/queries'
import { DAY_WORD } from '~/screens/agent/words'
import { Banner } from '~/ui/Banner'
import { SaveButton } from '~/ui/SaveButton'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'

type Windows = Record<Weekday, { start: string; end: string }[]>

const DEFAULT_WINDOW = { start: '09:00', end: '17:00' }

const toDraft = (hours: Availability['hours']): Windows => {
  const draft = Object.fromEntries(WEEKDAYS.map((day) => [day, []])) as unknown as Windows
  for (const entry of hours) {
    draft[entry.day] = entry.windows.map((window) => ({ ...window }))
  }
  return draft
}

const isZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** The weekly hours and time zone of the caller, laid out as a ledger of days that is also its form. */
export function HoursSection(props: {
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const availability = useAvailability()
  return (
    <Section
      id='hours'
      title='Hours'
      description='When you take meetings, in your own time zone. A day with no window is a day off.'
    >
      {availability.isPending ? (
        <p role='status' className='notice'>
          Loading your hours...
        </p>
      ) : availability.isError ? (
        <>
          <Banner kind='error'>{presentCalendar(availability.error).message}</Banner>
          <button type='button' className='button' onClick={() => void availability.refetch()}>
            Try again
          </button>
        </>
      ) : (
        <HoursForm current={availability.data} onDone={props.onDone} onFail={props.onFail} />
      )}
    </Section>
  )
}

function HoursForm(props: {
  readonly current: Availability
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const app = useApp()
  const { current } = props
  const [draft, setDraft] = useState<Windows>(() => toDraft(current.hours))
  const [timeZone, setTimeZone] = useState(current.timeZone)
  const [error, setError] = useState<string | undefined>()
  const [savedAt, setSavedAt] = useState(0)
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const save = useSubmit<Availability>(
    async (body) => {
      await app.calendar.setAvailability(body)
      setError(undefined)
      await refresh(app, 'calendar')
      setSavedAt((n) => n + 1)
      props.onDone('Your hours are saved.')
    },
    {
      onError(failure) {
        props.onFail()
        setError(presentCalendar(failure).message)
        focusFirstError()
      },
    }
  )

  const change = (day: Weekday, next: Windows[Weekday]) =>
    setDraft((now) => ({ ...now, [day]: next }))
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const zone = timeZone.trim()
    const parsed = availabilitySchema.safeParse({
      timeZone: zone,
      hours: WEEKDAYS.filter((day) => draft[day].length > 0).map((day) => ({
        day,
        windows: draft[day],
      })),
      dailyCap: current.dailyCap,
      awayUntil: current.awayUntil,
    })
    if (!isZone(zone)) {
      props.onFail()
      setError('Choose a real time zone, such as America/New_York.')
      focusFirstError()
    } else if (!parsed.success) {
      props.onFail()
      setError(
        'Each window needs a start before its end, and windows on one day cannot overlap or run past four.'
      )
      focusFirstError()
    } else {
      save.submit(parsed.data)
    }
  }
  const zones =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  const mine = browserZone()
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className='max-w-3xl gap-0'>
      <div ref={bannerRef} tabIndex={-1}>
        {error === undefined ? null : <Banner kind='error'>{error}</Banner>}
      </div>
      <div className='mb-6 flex max-w-md flex-col gap-2'>
        <Label htmlFor='hours-zone'>Time zone</Label>
        <Input
          id='hours-zone'
          name='timeZone'
          list='hours-zones'
          autoComplete='off'
          spellCheck={false}
          value={timeZone}
          onChange={(event) => setTimeZone(event.target.value)}
        />
        <datalist id='hours-zones'>
          {zones.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
        {mine !== timeZone ? (
          <p className='hint m-0'>
            This browser is on {mine}.{' '}
            <button type='button' className='link' onClick={() => setTimeZone(mine)}>
              Use {mine}
            </button>
          </p>
        ) : null}
      </div>
      <ul className='m-0 list-none border-y p-0'>
        {WEEKDAYS.map((day) => {
          const windows = draft[day]
          const word = DAY_WORD[day]
          return (
            <li
              key={day}
              className='flex flex-wrap items-start gap-x-6 gap-y-2 border-b py-3 last:border-b-0'
            >
              <span className='w-24 pt-2'>
                <strong>{word.long}</strong>
              </span>
              <div className='flex min-w-0 flex-1 flex-col gap-2'>
                {windows.length === 0 ? <span className='hint pt-2'>Off</span> : null}
                {windows.map((window, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: windows have no id; the order is the identity
                  <div key={index} className='flex flex-wrap items-center gap-2'>
                    <input
                      type='time'
                      className='input w-36'
                      aria-label={`${word.long} window ${index + 1} from`}
                      value={window.start}
                      onChange={(event) =>
                        change(
                          day,
                          windows.map((w, i) =>
                            i === index ? { ...w, start: event.target.value } : w
                          )
                        )
                      }
                    />
                    <span aria-hidden='true'>to</span>
                    <input
                      type='time'
                      className='input w-36'
                      aria-label={`${word.long} window ${index + 1} until`}
                      value={window.end}
                      onChange={(event) =>
                        change(
                          day,
                          windows.map((w, i) =>
                            i === index ? { ...w, end: event.target.value } : w
                          )
                        )
                      }
                    />
                    <button
                      type='button'
                      className='button button-quiet'
                      aria-label={`Remove ${word.long} window ${index + 1}`}
                      onClick={() =>
                        change(
                          day,
                          windows.filter((_, i) => i !== index)
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              {windows.length < MAX_WINDOWS_PER_DAY ? (
                <button
                  type='button'
                  className='button button-quiet'
                  aria-label={`Add ${word.long} window`}
                  onClick={() => change(day, [...windows, { ...DEFAULT_WINDOW }])}
                >
                  Add window
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
      <div className='row-actions mt-6'>
        <SaveButton pending={save.pending} savedAt={savedAt} pendingLabel='Saving...'>
          Save hours
        </SaveButton>
      </div>
    </form>
  )
}
