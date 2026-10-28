import { type FormEvent, useState } from 'react'
import type {
  DomainCheck,
  Mailbox,
  MailboxHealth,
  OrganizationMailLimits,
} from 'tula-closeline-contract'
import { fingerprint } from '~/api/idempotency'
import { DOMAIN_STATUS, presentMail } from '~/api/mail-messages'
import { useApp } from '~/app-context'
import { refreshMail, useDomainCheck, useMailboxHealth } from '~/data/mail-queries'
import { Banner } from '~/ui/Banner'
import { Field } from '~/ui/Field'
import { useSubmit } from '~/ui/useSubmit'
import { When } from '~/ui/When'

const COMPONENT_WORD = {
  hard_bounce_rate: 'Hard bounces',
  complaint_rate: 'Spam complaints',
  soft_bounce_error_rate: 'Soft bounces and errors',
  reply_rate: 'Replies',
  provider_warnings: 'Provider warnings',
} as const

const STATE_WORD = { ok: 'Fine', warning: 'Warning', critical: 'Critical' } as const

const EFFECT_WORD = {
  none: 'No effect on sending.',
  limit_halved: 'Its daily limit is halved until the score recovers.',
  paused: 'It is paused until the score recovers and an Admin resumes it.',
} as const

const percent = (rate: number) => `${Math.round(rate * 1000) / 10}%`

/** The health score of a Mailbox and what each part contributes to it. */
function HealthPanel(props: { readonly mailboxId: string }) {
  const health = useMailboxHealth(props.mailboxId, true)
  if (health.isPending) {
    return <p role='status'>Loading health...</p>
  }
  if (health.isError) {
    return <Banner kind='error'>{presentMail(health.error).message}</Banner>
  }
  const data: MailboxHealth = health.data
  return (
    <div>
      {data.status === 'scored' ? (
        <p className='m-0'>
          <strong>Health score {data.score} of 100.</strong> {EFFECT_WORD[data.effect]}
        </p>
      ) : (
        <p className='m-0'>
          Not enough sends to score yet: {data.sampleSize} of {data.minimumSample} in the last{' '}
          {data.windowDays} days.
        </p>
      )}
      {data.components.length === 0 ? null : (
        <ul className='m-0 mt-2 list-none p-0' aria-label='What the score is made of'>
          {data.components.map((part) => {
            const count = part.component === 'provider_warnings'
            const show = (value: number) => (count ? String(value) : percent(value))
            return (
              <li key={part.component} className='hint'>
                {COMPONENT_WORD[part.component]}: {show(part.value)}, {STATE_WORD[part.state]}.
                Warning from {show(part.warningThreshold)}, critical from{' '}
                {show(part.criticalThreshold)}.
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** The SPF, DKIM and DMARC state of the Mailbox's domain, with a Check button for an Owner or Admin. */
function DomainPanel(props: {
  readonly mailbox: Mailbox
  readonly canCheck: boolean
  readonly onDone: (notice: string) => void
}) {
  const app = useApp()
  const check = useDomainCheck(props.mailbox.id, true)
  const [error, setError] = useState<string | undefined>()
  const run = useSubmit<undefined>(
    async () => {
      const attempt = app.keys.begin(fingerprint.domainCheck(props.mailbox.id))
      try {
        await app.outbound.checkDomain(props.mailbox.id, attempt.key)
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      setError(undefined)
      await refreshMail(app)
      props.onDone('Domain checked.')
    },
    { onError: (failure) => setError(presentMail(failure).message) }
  )
  const data: DomainCheck | undefined = check.data
  return (
    <div>
      {error === undefined ? null : <Banner kind='error'>{error}</Banner>}
      {check.isPending ? <p role='status'>Loading the domain check...</p> : null}
      {check.isError ? <Banner kind='error'>{presentMail(check.error).message}</Banner> : null}
      {data === undefined ? null : data.checkedAt === null ? (
        <p className='m-0'>The domain {data.domain} has not been checked yet.</p>
      ) : (
        <>
          <p className='m-0'>
            Domain {data.domain}, checked <When iso={data.checkedAt} />
          </p>
          <ul className='m-0 mt-2 list-none p-0' aria-label='Domain records'>
            {data.results.map((result) => (
              <li key={result.record} className='mb-2'>
                <strong>{result.record.toUpperCase()}</strong>: {DOMAIN_STATUS[result.status]}
                <span className='hint block'>{result.explanation}</span>
                {result.suggestedRecord === null ? null : (
                  <code className='block break-all'>{result.suggestedRecord}</code>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {props.canCheck ? (
        <button
          type='button'
          className='button button-quiet'
          aria-disabled={run.pending}
          onClick={() => run.submit(undefined)}
        >
          {run.pending ? 'Checking...' : 'Check domain now'}
        </button>
      ) : null}
    </div>
  )
}

/** Turns what was typed into whole numbers, or null when a field is not one. */
function whole(text: string): number | null {
  return /^\d{1,5}$/.test(text.trim()) ? Number(text) : null
}

/** The limits form: it refuses a value above the Organization ceiling before the call, and the service refuses it again. */
function LimitsForm(props: {
  readonly mailbox: Mailbox
  readonly ceilings: OrganizationMailLimits
  readonly onDone: (notice: string) => void
}) {
  const app = useApp()
  const { limits } = props.mailbox
  const { ceilings } = props
  const [perDay, setPerDay] = useState(String(limits.perDay))
  const [perHour, setPerHour] = useState(String(limits.perHour))
  const [gap, setGap] = useState(String(limits.minGapSeconds))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<string | undefined>()
  const save = useSubmit<{ perDay: number; perHour: number; minGapSeconds: number }>(
    async (next) => {
      await app.outbound.setLimits(props.mailbox.id, { ...limits, ...next })
      setFailure(undefined)
      await refreshMail(app)
      props.onDone('Limits saved.')
    },
    { onError: (error) => setFailure(presentMail(error).message) }
  )
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const day = whole(perDay)
    const hour = whole(perHour)
    const gapSeconds = whole(gap)
    const next: Record<string, string> = {}
    if (day === null || day < 1 || day > ceilings.perDayCeiling) {
      next.perDay = `Enter a whole number from 1 to ${ceilings.perDayCeiling}, your Organization's ceiling.`
    }
    if (hour === null || hour < 1 || hour > ceilings.perHourCeiling) {
      next.perHour = `Enter a whole number from 1 to ${ceilings.perHourCeiling}, your Organization's ceiling.`
    }
    if (gapSeconds === null || gapSeconds < ceilings.minGapFloorSeconds || gapSeconds > 3600) {
      next.gap = `Enter a whole number of seconds from ${ceilings.minGapFloorSeconds}, the least your Organization allows, to 3600.`
    }
    setErrors(next)
    if (day !== null && hour !== null && gapSeconds !== null && Object.keys(next).length === 0) {
      save.submit({ perDay: day, perHour: hour, minGapSeconds: gapSeconds })
    }
  }
  return (
    <form onSubmit={onSubmit} noValidate aria-label={`Limits for ${props.mailbox.address}`}>
      {failure === undefined ? null : <Banner kind='error'>{failure}</Banner>}
      <Field
        label='Emails per day'
        inputMode='numeric'
        autoComplete='off'
        hint={`At most ${ceilings.perDayCeiling}.`}
        value={perDay}
        error={errors.perDay}
        onChange={(event) => setPerDay(event.target.value)}
      />
      <Field
        label='Emails per hour'
        inputMode='numeric'
        autoComplete='off'
        hint={`At most ${ceilings.perHourCeiling}.`}
        value={perHour}
        error={errors.perHour}
        onChange={(event) => setPerHour(event.target.value)}
      />
      <Field
        label='Seconds between emails'
        inputMode='numeric'
        autoComplete='off'
        hint={`At least ${ceilings.minGapFloorSeconds}.`}
        value={gap}
        error={errors.gap}
        onChange={(event) => setGap(event.target.value)}
      />
      <button type='submit' className='button' aria-disabled={save.pending}>
        {save.pending ? 'Saving...' : 'Save limits'}
      </button>
    </form>
  )
}

/** Everything about one Mailbox beyond its summary: limits, health and the domain check. */
export function MailboxDetails(props: {
  readonly mailbox: Mailbox
  readonly ceilings: OrganizationMailLimits | undefined
  readonly canCheckDomain: boolean
  readonly onDone: (notice: string) => void
}) {
  const { mailbox } = props
  return (
    <div className='mt-4 grid gap-6 md:grid-cols-3'>
      <section aria-labelledby={`${mailbox.id}-limits`}>
        <h3 id={`${mailbox.id}-limits`} className='label-mono m-0 mb-2'>
          Limits
        </h3>
        {props.ceilings === undefined ? (
          <p className='hint'>
            The Organization's ceilings could not be read, so limits cannot be changed now.
          </p>
        ) : mailbox.state === 'disconnected' ? (
          <p className='hint'>Connect the Mailbox again to change its limits.</p>
        ) : (
          <LimitsForm mailbox={mailbox} ceilings={props.ceilings} onDone={props.onDone} />
        )}
      </section>
      <section aria-labelledby={`${mailbox.id}-health`}>
        <h3 id={`${mailbox.id}-health`} className='label-mono m-0 mb-2'>
          Health
        </h3>
        <HealthPanel mailboxId={mailbox.id} />
      </section>
      <section aria-labelledby={`${mailbox.id}-domain`}>
        <h3 id={`${mailbox.id}-domain`} className='label-mono m-0 mb-2'>
          Domain
        </h3>
        <DomainPanel mailbox={mailbox} canCheck={props.canCheckDomain} onDone={props.onDone} />
      </section>
    </div>
  )
}
