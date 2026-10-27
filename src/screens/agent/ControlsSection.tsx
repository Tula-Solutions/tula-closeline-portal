import { type FormEvent, useState } from 'react'
import {
  type AgentKind,
  CONTROL_LEVELS,
  type ControlLevel,
  ESCALATION_ACTIONS,
  ESCALATION_TRIGGERS,
  type EscalationTrigger,
  setAgentControlRequestSchema,
  WEEKDAYS,
  type Weekday,
} from 'tula-closeline-contract'
import type { AgentControl, AgentControlRequest, ControlChannelParam } from '~/api/agent'
import { presentAgent } from '~/api/agent-messages'
import { fingerprint } from '~/api/idempotency'
import { useApp } from '~/app-context'
import { Section } from '~/components/app/section'
import { Input } from '~/components/ui/input'
import { CHANNEL_NAME } from '~/data/consent'
import { refresh, useAgentControls } from '~/data/queries'
import {
  ACTION_WORD,
  DAY_WORD,
  KIND_NAME,
  LEVEL_WORD,
  TRIGGER_WORD,
  windowSummary,
} from '~/screens/agent/words'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
import { SaveButton } from '~/ui/SaveButton'
import { SelectField } from '~/ui/SelectField'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'
import { When } from '~/ui/When'

type Callbacks = {
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}

const CHANNELS = ['phone', 'sms', 'whatsapp', 'email', 'linkedin'] as const

type Row = { readonly param: ControlChannelParam; readonly name: string }

const ROWS: readonly Row[] = [
  { param: 'default', name: 'Default' },
  ...CHANNELS.map((channel) => ({ param: channel, name: CHANNEL_NAME[channel] })),
]

/** A start for a setting nobody has saved yet: supervised, working hours on weekdays. */
function starter(): AgentControlRequest {
  return {
    level: 'supervised',
    sendWindow: {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      days: WEEKDAYS.slice(0, 5).map((day) => ({
        day,
        windows: [{ start: '09:00', end: '17:00' }],
      })),
    },
    escalationRules: [],
  }
}

/** The control level, send window and escalation rules of one Agent kind, by channel. */
export function ControlsSection(
  props: Callbacks & { readonly kind: AgentKind; readonly manage: boolean }
) {
  const controls = useAgentControls(props.kind, true)
  const [editing, setEditing] = useState<ControlChannelParam | null>(null)
  return (
    <Section
      id='controls'
      title={`${KIND_NAME[props.kind]}: control levels`}
      description='How far the Agent may go before a person approves. A channel without its own setting follows the default. Where nothing is saved, the level is Supervised.'
    >
      {controls.isPending ? (
        <p role='status' className='notice'>
          Loading the control levels...
        </p>
      ) : controls.isError ? (
        <>
          <Banner kind='error'>{presentAgent(controls.error).message}</Banner>
          <button type='button' className='button' onClick={() => void controls.refetch()}>
            Try again
          </button>
        </>
      ) : (
        <ul
          className='m-0 list-none divide-y border-y p-0 motion-safe:animate-fade'
          aria-label='Control levels'
        >
          {ROWS.map((row) => {
            const own = controls.data.find((item) => (item.channel ?? 'default') === row.param)
            const fallback = controls.data.find((item) => item.channel === null)
            return (
              <li key={row.param} className='py-4'>
                <div className='list-item-head'>
                  <div className='flex min-w-0 flex-col'>
                    <span className='label-mono block'>{row.name}</span>
                    <Summary control={own} fallback={fallback} />
                  </div>
                  {props.manage ? (
                    <div className='row-actions'>
                      <button
                        type='button'
                        className='button button-quiet'
                        aria-label={`${own ? 'Edit' : 'Set'} ${row.name}`}
                        aria-expanded={editing === row.param}
                        aria-controls={`control-${row.param}-form`}
                        onClick={() => setEditing(editing === row.param ? null : row.param)}
                      >
                        {own ? 'Edit' : 'Set its own'}
                      </button>
                    </div>
                  ) : null}
                </div>
                {editing === row.param ? (
                  <div
                    id={`control-${row.param}-form`}
                    className='mt-4 border-l-2 border-rule-strong pl-4'
                  >
                    <ControlForm
                      kind={props.kind}
                      row={row}
                      initial={own ?? fallback}
                      onDone={(notice) => {
                        setEditing(null)
                        props.onDone(notice)
                      }}
                      onFail={props.onFail}
                      onCancel={() => setEditing(null)}
                    />
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

function Summary(props: {
  readonly control: AgentControl | undefined
  readonly fallback: AgentControl | undefined
}) {
  const shown = props.control ?? props.fallback
  if (!shown) {
    return <span className='hint mt-1'>Supervised. Nothing saved yet.</span>
  }
  const rules = shown.escalationRules
  return (
    <>
      <span className='mt-1'>
        <strong>{LEVEL_WORD[shown.level].name}</strong>
        {props.control ? null : ' (follows the default)'}
      </span>
      <span className='hint mt-1'>
        {windowSummary(shown.sendWindow.days, WEEKDAYS)} · {shown.sendWindow.timeZone}
      </span>
      <span className='hint mt-1'>
        {rules.length === 0
          ? 'No escalation rules'
          : rules
              .map(
                (rule) => `${TRIGGER_WORD[rule.trigger]}: ${ACTION_WORD[rule.action].toLowerCase()}`
              )
              .join('; ')}
      </span>
      {props.control ? (
        <span className='hint mt-1'>
          Changed <When iso={props.control.updatedAt} />
        </span>
      ) : null}
    </>
  )
}

type DayState = Partial<Record<Weekday, readonly { start: string; end: string }[]>>

function ControlForm(
  props: Callbacks & {
    readonly kind: AgentKind
    readonly row: Row
    readonly initial: AgentControl | undefined
    readonly onCancel: () => void
  }
) {
  const app = useApp()
  const base = props.initial ?? starter()
  const [level, setLevel] = useState<ControlLevel>(base.level)
  const [timeZone, setTimeZone] = useState(base.sendWindow.timeZone)
  const [days, setDays] = useState<DayState>(
    Object.fromEntries(base.sendWindow.days.map((item) => [item.day, item.windows]))
  )
  const [rules, setRules] = useState<Partial<Record<EscalationTrigger, string>>>(
    Object.fromEntries(base.escalationRules.map((rule) => [rule.trigger, rule.action]))
  )
  const [error, setError] = useState<string | undefined>()
  const [savedAt, setSavedAt] = useState(0)
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const save = useSubmit<AgentControlRequest>(
    async (body) => {
      const attempt = app.keys.begin(
        fingerprint.agentControl(props.kind, props.row.param, JSON.stringify(body))
      )
      try {
        await app.agent.setControl(props.kind, props.row.param, body, attempt.key)
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      await refresh(app, 'agent')
      setSavedAt(Date.now())
      props.onDone(`${props.row.name} saved.`)
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
    const parsed = setAgentControlRequestSchema.safeParse({
      level,
      sendWindow: {
        timeZone: timeZone.trim(),
        days: WEEKDAYS.flatMap((day) => {
          const windows = days[day]
          return windows ? [{ day, windows }] : []
        }),
      },
      escalationRules: ESCALATION_TRIGGERS.flatMap((trigger) => {
        const action = rules[trigger]
        return action ? [{ trigger, action }] : []
      }),
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
      <fieldset className='mb-6 min-w-0 border-0 p-0'>
        <legend className='mb-2 text-sm font-medium'>Control level</legend>
        {CONTROL_LEVELS.map((choice) => (
          <label key={choice} className='mb-2 flex items-start gap-2'>
            <input
              type='radio'
              name={`level-${props.row.param}`}
              className='mt-1'
              checked={level === choice}
              onChange={() => setLevel(choice)}
            />
            <span>
              <strong>{LEVEL_WORD[choice].name}</strong>
              <span className='hint block'>{LEVEL_WORD[choice].effect}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Field
        label='Time zone'
        name='time-zone'
        autoComplete='off'
        hint='The zone the send window is read in, such as Europe/London.'
        value={timeZone}
        onChange={(event) => setTimeZone(event.target.value)}
      />
      <fieldset className='mb-6 min-w-0 border-0 p-0'>
        <legend className='mb-1 text-sm font-medium'>Send window</legend>
        <p className='hint mt-0 mb-2'>
          The hours the Agent may send. A day left unticked has no window, so nothing is sent that
          day. Calls stay within 08:00 to 21:00 whatever you choose.
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
      <fieldset className='mb-6 min-w-0 border-0 p-0'>
        <legend className='mb-1 text-sm font-medium'>Escalation rules</legend>
        <p className='hint mt-0 mb-2'>
          What the Agent does when a conversation reaches one of these points.
        </p>
        {ESCALATION_TRIGGERS.map((trigger) => (
          <SelectField
            key={trigger}
            label={TRIGGER_WORD[trigger]}
            name={`rule-${trigger}`}
            value={rules[trigger] ?? ''}
            options={[
              { value: '', text: 'Nothing extra' },
              ...ESCALATION_ACTIONS.map((action) => ({
                value: action,
                text: ACTION_WORD[action],
              })),
            ]}
            onChange={(event) => setRules((now) => ({ ...now, [trigger]: event.target.value }))}
          />
        ))}
      </fieldset>
      <div className='row-actions'>
        <SaveButton pending={save.pending} savedAt={savedAt} pendingLabel='Saving...'>
          Save {props.row.name}
        </SaveButton>
        <button type='button' className='button button-quiet' onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

const INVALID =
  'Check the settings: keep every send window between 08:00 and 21:00 with its start before its end, and use a real time zone such as Europe/London.'
