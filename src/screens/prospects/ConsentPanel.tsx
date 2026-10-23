import { type FormEvent, useState } from 'react'
import {
  CONSENT_CHANNELS,
  CONSENT_RECORDABLE_SOURCES,
  type ConsentChannel,
  type ConsentEvent,
  type ConsentWording,
  MAX_EVIDENCE_REF_LENGTH,
  type RecordConsentRequest,
  recordConsentRequestSchema,
  type WithdrawConsentRequest,
} from 'tula-closeline-contract'
import { presentConsent } from '~/api/consent-messages'
import { fingerprint } from '~/api/idempotency'
import { useApp } from '~/app-context'
import { Section } from '~/components/app/section'
import { CHANNEL_NAME, denial, REASON_WORD, SOURCE_WORD, STATE_WORD } from '~/data/consent'
import { refresh, useConsentEvents, useConsentWordings, useProspectConsent } from '~/data/queries'
import { Banner } from '~/ui/Banner'
import { Confirm } from '~/ui/Confirm'
import { Field } from '~/ui/Field'
import { Paged } from '~/ui/Paged'
import { SelectField } from '~/ui/SelectField'
import { Untrusted } from '~/ui/Untrusted'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'
import { When } from '~/ui/When'

/** Wraps untrusted text in direction isolates, for places markup cannot reach (an option's text). */
function isolate(text: string): string {
  return `⁨${text}⁩`
}

/**
 * Contact Consent on one Prospect: the state of each channel and why contact is denied, the
 * evidence behind every change in ruled rows, and the actions to record a grant or withdraw one.
 */
export function ConsentPanel(props: {
  readonly prospectId: string
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const { prospectId } = props
  const app = useApp()
  const consent = useProspectConsent(prospectId)
  const events = useConsentEvents(prospectId)
  const wordings = useConsentWordings(true)
  const [recording, setRecording] = useState<ConsentChannel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const withdraw = useSubmit<{ readonly body: WithdrawConsentRequest; readonly notice: string }>(
    async ({ body, notice }) => {
      const attempt = app.keys.begin(
        fingerprint.consentWithdrawal(prospectId, JSON.stringify(body))
      )
      try {
        await app.consent.withdrawConsent(prospectId, body, attempt.key)
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      await refresh(app, 'consent')
      props.onDone(notice)
    },
    {
      onError(failure) {
        props.onFail()
        setError(presentConsent(failure).message)
      },
    }
  )
  const wordingById = (id: string | null): ConsentWording | undefined =>
    id === null ? undefined : wordings.items.find((wording) => wording.id === id)
  return (
    <Section
      id='contact-consent'
      title='Contact Consent'
      description='Whether an Agent may contact this Prospect, channel by channel, and the evidence kept for every change.'
    >
      {consent.isPending ? (
        <p role='status' className='sr-only'>
          Loading Contact Consent...
        </p>
      ) : consent.isError ? (
        <Banner kind='error'>{presentConsent(consent.error).message}</Banner>
      ) : (
        <>
          {consent.data.suppressed ? (
            <Banner kind='warning'>
              {`This Prospect is on the Suppression list (${
                consent.data.suppressionReason === null
                  ? 'no reason given'
                  : REASON_WORD[consent.data.suppressionReason]
              }). No Agent will contact them on any channel.`}
            </Banner>
          ) : null}
          {error ? (
            <p className='field-error' role='alert'>
              <strong>Error:</strong> {error}
            </p>
          ) : null}
          <ul
            className='m-0 list-none divide-y border-y p-0 motion-safe:animate-fade'
            aria-label='Contact Consent by channel'
          >
            {CONSENT_CHANNELS.map((channel) => {
              const row = consent.data.channels.find((candidate) => candidate.channel === channel)
              const state = row?.state ?? 'none'
              const denied = denial(channel, state, consent.data.suppressed)
              const wording = wordingById(row?.wordingId ?? null)
              const name = CHANNEL_NAME[channel]
              return (
                <li key={channel} className='py-4'>
                  <div className='list-item-head'>
                    <div className='flex min-w-0 flex-col'>
                      <h3 className='item-title m-0 font-serif text-xl font-normal tracking-[-0.01em]'>
                        {name}
                      </h3>
                      <span className='label-mono mt-1 block'>
                        {STATE_WORD[state]}
                        {row?.since ? (
                          <>
                            {' since '}
                            <When iso={row.since} />
                          </>
                        ) : null}
                      </span>
                      {wording ? (
                        <span className='hint'>
                          Consent Wording {wording.version}: <Untrusted value={wording.text} />
                        </span>
                      ) : null}
                      {denied ? <span className='hint'>{denied}</span> : null}
                    </div>
                    <div className='row-actions'>
                      <button
                        type='button'
                        className='button button-quiet'
                        aria-label={`Record consent for ${name}`}
                        aria-expanded={recording === channel}
                        aria-controls='record-consent'
                        onClick={() => setRecording((now) => (now === channel ? null : channel))}
                      >
                        Record consent
                      </button>
                      {state === 'granted' ? (
                        <Confirm
                          label='Withdraw'
                          accessibleName={`Withdraw consent for ${name}`}
                          pendingAccessibleName={`Withdrawing consent for ${name}`}
                          pendingLabel='Withdrawing...'
                          question={`Withdraw consent on ${name}? An Agent will not contact this Prospect there until new consent is recorded.`}
                          confirmLabel='Withdraw consent'
                          tone='quiet-destructive'
                          pending={withdraw.pending}
                          onConfirm={() => {
                            setError(null)
                            withdraw.submit({
                              body: { channels: [channel] },
                              notice: `Consent withdrawn on ${name}.`,
                            })
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
          {consent.data.channels.some((row) => row.state === 'granted') ? (
            <div className='row-actions mt-4'>
              <Confirm
                label='Withdraw consent on every channel'
                accessibleName='Withdraw consent on every channel'
                pendingAccessibleName='Withdrawing consent on every channel'
                pendingLabel='Withdrawing...'
                question='Withdraw consent on every channel? An Agent will not contact this Prospect anywhere until new consent is recorded.'
                confirmLabel='Withdraw all consent'
                tone='quiet-destructive'
                pending={withdraw.pending}
                onConfirm={() => {
                  setError(null)
                  withdraw.submit({
                    body: { all: true },
                    notice: 'Consent withdrawn on every channel.',
                  })
                }}
              />
            </div>
          ) : null}
          {recording === null ? null : (
            <RecordForm
              key={recording}
              prospectId={prospectId}
              channel={recording}
              wordings={wordings.items}
              wordingsLoading={wordings.state.isPending}
              onClose={() => setRecording(null)}
              onDone={props.onDone}
              onFail={props.onFail}
            />
          )}
        </>
      )}
      <h3 className='mt-8 mb-3 font-serif text-xl font-normal'>Evidence</h3>
      <Paged
        noun='evidence'
        emptyText='No consent has been recorded for this Prospect.'
        emptyHint='When consent is recorded or withdrawn, the evidence appears here.'
        state={events.state}
        present={presentConsent}
      >
        <ul
          className='m-0 list-none divide-y border-y p-0 motion-safe:animate-fade'
          aria-label='Consent evidence'
        >
          {events.items.map((event) => (
            <EvidenceRow key={event.id} event={event} wording={wordingById(event.wordingId)} />
          ))}
        </ul>
      </Paged>
    </Section>
  )
}

function EvidenceRow(props: { readonly event: ConsentEvent; readonly wording?: ConsentWording }) {
  const { event, wording } = props
  return (
    <li className='py-3'>
      <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1'>
        <span className='label-mono'>{event.kind === 'granted' ? 'Granted' : 'Withdrawn'}</span>
        <span className='item-title'>{CHANNEL_NAME[event.channel]}</span>
        <span className='hint'>
          {SOURCE_WORD[event.source]} · <When iso={event.occurredAt} />
        </span>
      </div>
      {event.stopAll ? <p className='hint m-0'>Applied to every channel.</p> : null}
      {wording ? (
        <p className='hint m-0'>
          Consent Wording {wording.version}: <Untrusted value={wording.text} />
        </p>
      ) : event.wordingId !== null ? (
        <p className='hint m-0'>Consent Wording on file.</p>
      ) : null}
      {event.evidenceRef !== null ? (
        <p className='hint m-0'>
          Evidence: <Untrusted value={event.evidenceRef} />
        </p>
      ) : null}
    </li>
  )
}

type RecordErrors = {
  wordingId?: string
  evidenceRef?: string
  callId?: string
  form?: string
}

const RECORD_WORDS = {
  wordingId: 'Choose the Consent Wording the Prospect was shown.',
  evidenceRef: `Say where the evidence is kept, in ${MAX_EVIDENCE_REF_LENGTH} characters or fewer.`,
  callId: 'Enter the Call this consent was given on.',
} as const

function RecordForm(props: {
  readonly prospectId: string
  readonly channel: ConsentChannel
  readonly wordings: readonly ConsentWording[]
  readonly wordingsLoading: boolean
  readonly onClose: () => void
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const app = useApp()
  const name = CHANNEL_NAME[props.channel]
  const covering = props.wordings.filter((wording) => wording.channels.includes(props.channel))
  const [source, setSource] = useState<RecordConsentRequest['source']>('manual')
  const [wordingId, setWordingId] = useState('')
  const [evidenceRef, setEvidenceRef] = useState('')
  const [callId, setCallId] = useState('')
  const [errors, setErrors] = useState<RecordErrors>({})
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const chosenWording = covering.some((wording) => wording.id === wordingId)
    ? wordingId
    : (covering[0]?.id ?? '')
  const record = useSubmit<RecordConsentRequest>(
    async (body) => {
      const attempt = app.keys.begin(
        fingerprint.consentGrant(props.prospectId, JSON.stringify(body))
      )
      try {
        await app.consent.recordConsent(props.prospectId, body, attempt.key)
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      await refresh(app, 'consent')
      props.onDone(`Consent recorded on ${name}.`)
      props.onClose()
    },
    {
      onError(failure) {
        props.onFail()
        setErrors({ form: presentConsent(failure).message })
        focusFirstError()
      },
    }
  )
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (record.pending) {
      return
    }
    props.onFail()
    if (covering.length === 0) {
      setErrors({ form: `No Consent Wording covers ${name} yet, so consent cannot be recorded.` })
      focusFirstError()
      return
    }
    const trimmedCall = callId.trim()
    const candidate = {
      channel: props.channel,
      source,
      wordingId: chosenWording,
      evidenceRef: evidenceRef.trim(),
      ...(source === 'verbal_call' ? { callId: trimmedCall } : {}),
    }
    const parsed = recordConsentRequestSchema.safeParse(candidate)
    if (!parsed.success) {
      const next: RecordErrors = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (field === 'wordingId' || field === 'evidenceRef' || field === 'callId') {
          next[field] = RECORD_WORDS[field]
        }
      }
      setErrors(next)
      focusFirstError()
      return
    }
    setErrors({})
    record.submit(parsed.data)
  }
  return (
    <form
      ref={formRef}
      id='record-consent'
      noValidate
      aria-labelledby='record-consent-heading'
      className='mt-6 max-w-none gap-0 border-l-2 border-rule-strong pl-4 motion-safe:animate-rise'
      onSubmit={onSubmit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          props.onClose()
        }
      }}
    >
      <h3 id='record-consent-heading' className='mt-0 mb-3 font-serif text-xl font-normal'>
        Record consent on {name}
      </h3>
      {errors.form ? (
        <Banner kind='error' innerRef={bannerRef}>
          {errors.form}
        </Banner>
      ) : null}
      <SelectField
        label='Source'
        name='source'
        value={source}
        options={CONSENT_RECORDABLE_SOURCES.map((value) => ({
          value,
          text: SOURCE_WORD[value],
        }))}
        onChange={(event) => {
          const next = CONSENT_RECORDABLE_SOURCES.find((value) => value === event.target.value)
          if (next !== undefined) {
            setSource(next)
          }
        }}
      />
      {props.wordingsLoading ? (
        <p role='status' className='hint'>
          Loading Consent Wordings...
        </p>
      ) : covering.length === 0 ? (
        <p className='hint'>No Consent Wording covers {name} yet, so consent cannot be recorded.</p>
      ) : (
        <SelectField
          label='Consent Wording'
          name='wordingId'
          value={chosenWording}
          error={errors.wordingId}
          options={covering.map((wording) => ({
            value: wording.id,
            text: isolate(wording.text),
          }))}
          onChange={(event) => setWordingId(event.target.value)}
        />
      )}
      <Field
        label='Evidence reference'
        name='evidenceRef'
        autoComplete='off'
        hint='Where the proof is kept, such as a note, a file name or a CRM record.'
        value={evidenceRef}
        error={errors.evidenceRef}
        onChange={(event) => setEvidenceRef(event.target.value)}
      />
      {source === 'verbal_call' ? (
        <Field
          label='Call reference'
          name='callId'
          autoComplete='off'
          hint='The Call the Prospect agreed on, from the Call page.'
          value={callId}
          error={errors.callId}
          onChange={(event) => setCallId(event.target.value)}
        />
      ) : null}
      <div className='row-actions'>
        <button
          type='submit'
          className='button'
          aria-disabled={record.pending || covering.length === 0}
        >
          {record.pending ? 'Recording...' : 'Record consent'}
        </button>
        <button type='button' className='button button-quiet' onClick={props.onClose}>
          Cancel
        </button>
      </div>
    </form>
  )
}
