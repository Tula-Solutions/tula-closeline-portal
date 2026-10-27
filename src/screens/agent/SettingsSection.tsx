import { type FormEvent, useState } from 'react'
import type { AgentSettings } from 'tula-closeline-contract'
import {
  AGENT_VOICE_STYLES,
  type AgentVoiceStyle,
  MAX_AGENT_CALL_COST_USD_CENTS,
  MAX_AGENT_CALL_SECONDS,
  MAX_AGENT_CONCURRENCY,
  MAX_AGENT_GREETING_LENGTH,
  type SetAgentSettingsRequest,
  setAgentSettingsRequestSchema,
  WEEKDAYS,
  type Weekday,
} from 'tula-closeline-contract'
import { presentAgent } from '~/api/agent-messages'
import { fingerprint } from '~/api/idempotency'
import { useApp } from '~/app-context'
import { Section } from '~/components/app/section'
import { Input } from '~/components/ui/input'
import { refresh, useVoiceSettings } from '~/data/queries'
import { DAY_WORD, VOICE_STYLE_WORD, windowSummary } from '~/screens/agent/words'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
import { SaveButton } from '~/ui/SaveButton'
import { SelectField } from '~/ui/SelectField'
import { TextAreaField } from '~/ui/TextAreaField'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'
import { When } from '~/ui/When'

type Callbacks = {
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}

/** How the Inbound Agent sounds and how far one call may go: greeting, voice, hours and caps. */
export function SettingsSection(props: Callbacks & { readonly manage: boolean }) {
  const settings = useVoiceSettings(true)
  const [editing, setEditing] = useState(false)
  return (
    <Section
      id='settings'
      title='Inbound Agent: voice settings'
      description='What callers hear and the limits on each call. Calls stay within 08:00 to 21:00 whatever hours you choose. The AI and recording notice is always spoken and has no setting.'
    >
      {settings.isPending ? (
        <p role='status' className='notice'>
          Loading the voice settings...
        </p>
      ) : settings.isError ? (
        <>
          <Banner kind='error'>{presentAgent(settings.error).message}</Banner>
          <button type='button' className='button' onClick={() => void settings.refetch()}>
            Try again
          </button>
        </>
      ) : editing ? (
        <SettingsForm
          initial={settings.data}
          onDone={(notice) => {
            setEditing(false)
            props.onDone(notice)
          }}
          onFail={props.onFail}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className='motion-safe:animate-fade'>
          <p className='m-0 whitespace-pre-wrap'>{settings.data.greeting}</p>
          <p className='hint mt-2'>
            {VOICE_STYLE_WORD[settings.data.voiceStyle]} voice · {settings.data.timeZone} ·{' '}
            {windowSummary(settings.data.hours, WEEKDAYS)}
          </p>
          <p className='hint mt-1'>
            Up to {settings.data.maxCallSeconds} seconds and {settings.data.maxCostUsdCents} US
            cents a call, {settings.data.concurrencyCap} calls at once ·{' '}
            {settings.data.languages.join(', ')}
            {settings.data.paused ? ' · Paused' : ''}
          </p>
          {settings.data.updatedAt ? (
            <p className='hint mt-1'>
              Changed <When iso={settings.data.updatedAt} />
            </p>
          ) : null}
          {props.manage ? (
            <div className='row-actions mt-4'>
              <button type='button' className='button' onClick={() => setEditing(true)}>
                Edit settings
              </button>
            </div>
          ) : null}
        </div>
      )}
    </Section>
  )
}

type DayState = Partial<Record<Weekday, readonly { start: string; end: string }[]>>

function SettingsForm(
  props: Callbacks & { readonly initial: AgentSettings; readonly onCancel: () => void }
) {
  const app = useApp()
  const { initial } = props
  const [paused, setPaused] = useState(initial.paused)
  const [greeting, setGreeting] = useState(initial.greeting)
  const [voiceStyle, setVoiceStyle] = useState<AgentVoiceStyle>(initial.voiceStyle)
  const [timeZone, setTimeZone] = useState(initial.timeZone)
  const [days, setDays] = useState<DayState>(
    Object.fromEntries(initial.hours.map((item) => [item.day, item.windows]))
  )
  const [maxCallSeconds, setMaxCallSeconds] = useState(String(initial.maxCallSeconds))
  const [maxCostUsdCents, setMaxCostUsdCents] = useState(String(initial.maxCostUsdCents))
  const [concurrencyCap, setConcurrencyCap] = useState(String(initial.concurrencyCap))
  const [error, setError] = useState<string | undefined>()
  const [savedAt, setSavedAt] = useState(0)
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const save = useSubmit<SetAgentSettingsRequest>(
    async (body) => {
      const attempt = app.keys.begin(fingerprint.agentSettings(JSON.stringify(body)))
      try {
        await app.voice.setSettings(body, attempt.key)
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      await refresh(app, 'agent')
      setSavedAt(Date.now())
      props.onDone('Settings saved.')
    },
    {
      onError(failure) {
        props.onFail()
        setError(presentAgent(failure).message)
        focusFirstError()
      },
    }
  )
  const setTime = (day: Weekday, edge: 'start' | 'end', value: string) =>
    setDays((now) => {
      const [first, ...rest] = now[day] ?? []
      return { ...now, [day]: [{ start: '09:00', end: '17:00', ...first, [edge]: value }, ...rest] }
    })
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (save.pending) {
      return
    }
    props.onFail()
    if (Object.keys(days).length === 0) {
      setError('Choose at least one day the Agent answers.')
      focusFirstError()
      return
    }
    const parsed = setAgentSettingsRequestSchema.safeParse({
      paused,
      greeting: greeting.trim(),
      voiceStyle,
      timeZone: timeZone.trim(),
      hours: WEEKDAYS.flatMap((day) => {
        const windows = days[day]
        return windows ? [{ day, windows }] : []
      }),
      maxCallSeconds: Number(maxCallSeconds),
      maxCostUsdCents: Number(maxCostUsdCents),
      concurrencyCap: Number(concurrencyCap),
    })
    if (!parsed.success) {
      setError(INVALID)
      focusFirstError()
      return
    }
    setError(undefined)
    save.submit(parsed.data)
  }
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className='max-w-none gap-0'>
      {error === undefined ? null : (
        <Banner kind='error' innerRef={bannerRef}>
          {error}
        </Banner>
      )}
      <TextAreaField
        label='Greeting'
        name='greeting'
        rows={3}
        maxLength={MAX_AGENT_GREETING_LENGTH}
        hint='The first thing a caller hears, after the AI and recording notice.'
        value={greeting}
        onChange={(event) => setGreeting(event.target.value)}
      />
      <SelectField
        label='Voice style'
        name='voice-style'
        value={voiceStyle}
        options={AGENT_VOICE_STYLES.map((style) => ({
          value: style,
          text: VOICE_STYLE_WORD[style],
        }))}
        onChange={(event) => setVoiceStyle(event.target.value as AgentVoiceStyle)}
      />
      <Field
        label='Time zone'
        name='time-zone'
        autoComplete='off'
        hint='The zone the hours are read in, such as Europe/London.'
        value={timeZone}
        onChange={(event) => setTimeZone(event.target.value)}
      />
      <fieldset className='mb-6 min-w-0 border-0 p-0'>
        <legend className='mb-1 text-sm font-medium'>Hours the Agent answers</legend>
        <p className='hint mt-0 mb-2'>
          Tick the days it answers. Hours stay between 08:00 and 21:00.
        </p>
        {WEEKDAYS.map((day) => {
          const windows = days[day]
          const first = windows?.[0]
          return (
            <div
              key={day}
              className='grid grid-cols-[8rem_minmax(0,9rem)_minmax(0,9rem)] items-center gap-x-2 gap-y-1 py-1'
            >
              <label className='flex items-center'>
                <input
                  type='checkbox'
                  checked={windows !== undefined}
                  onChange={(event) =>
                    setDays((now) => {
                      const next = { ...now }
                      if (event.target.checked) {
                        next[day] = [{ start: '09:00', end: '17:00' }]
                      } else {
                        delete next[day]
                      }
                      return next
                    })
                  }
                />
                {DAY_WORD[day].long}
              </label>
              {first ? (
                <>
                  <Input
                    type='time'
                    aria-label={`${DAY_WORD[day].long} from`}
                    value={first.start}
                    onChange={(event) => setTime(day, 'start', event.target.value)}
                  />
                  <Input
                    type='time'
                    aria-label={`${DAY_WORD[day].long} until`}
                    value={first.end}
                    onChange={(event) => setTime(day, 'end', event.target.value)}
                  />
                  {windows && windows.length > 1 ? (
                    <span className='hint col-span-3'>
                      and {windows.length - 1} more, kept as they are
                    </span>
                  ) : null}
                </>
              ) : null}
            </div>
          )
        })}
      </fieldset>
      <Field
        label='Longest call (seconds)'
        name='max-call-seconds'
        type='number'
        inputMode='numeric'
        hint={`From 30 to ${MAX_AGENT_CALL_SECONDS}.`}
        value={maxCallSeconds}
        onChange={(event) => setMaxCallSeconds(event.target.value)}
      />
      <Field
        label='Most one call may cost (US cents)'
        name='max-cost'
        type='number'
        inputMode='numeric'
        hint={`From 1 to ${MAX_AGENT_CALL_COST_USD_CENTS}.`}
        value={maxCostUsdCents}
        onChange={(event) => setMaxCostUsdCents(event.target.value)}
      />
      <Field
        label='Calls at once'
        name='concurrency'
        type='number'
        inputMode='numeric'
        hint={`From 1 to ${MAX_AGENT_CONCURRENCY}.`}
        value={concurrencyCap}
        onChange={(event) => setConcurrencyCap(event.target.value)}
      />
      <label className='mb-6 flex items-start gap-2'>
        <input
          type='checkbox'
          className='mt-1'
          checked={paused}
          onChange={(event) => setPaused(event.target.checked)}
        />
        <span>
          Stop answering calls
          <span className='hint block'>
            Pauses the voice only. The organization-wide pause above is separate.
          </span>
        </span>
      </label>
      <div className='row-actions'>
        <SaveButton pending={save.pending} savedAt={savedAt} pendingLabel='Saving...'>
          Save settings
        </SaveButton>
        <button type='button' className='button button-quiet' onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

const INVALID = `Check the settings: keep every hour between 08:00 and 21:00 with its start before its end, use a real time zone such as Europe/London, a greeting of up to ${MAX_AGENT_GREETING_LENGTH} characters, and numbers within the ranges shown.`
