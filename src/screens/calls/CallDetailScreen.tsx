import { getRouteApi, Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { type RecordingPlayback, wrapUpRequestSchema } from 'tula-closeline-contract'
import { presentCallHistory } from '~/api/voice-messages'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { Section } from '~/components/app/section'
import { useCall, useTranscript } from '~/data/calls'
import { can } from '~/data/permissions'
import { useRole } from '~/data/session-role'
import { CALL_STATE_WORD, formatDuration, formatOffset } from '~/screens/calls/format'
import { Banner } from '~/ui/Banner'
import { Confirm } from '~/ui/Confirm'
import { Field } from '~/ui/Field'
import { Paged } from '~/ui/Paged'
import { TextAreaField } from '~/ui/TextAreaField'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useFeedback } from '~/ui/useFeedback'
import { useFocusOnError } from '~/ui/useFocusOnError'
import { useSubmit } from '~/ui/useSubmit'
import { When } from '~/ui/When'

const route = getRouteApi('/_app/calls/$callId')

/** The longest a timer may wait; browsers fire a larger delay at once. */
const MAX_TIMER_MS = 2_147_000_000

/** One Call: its facts, wrap-up, Transcript and Recording, each shown by the caller's role. */
export function CallDetailScreen() {
  useDocumentTitle('Call')
  const { callId } = route.useParams()
  const role = useRole()
  const { query, store } = useCall(callId)
  const feedback = useFeedback()
  const transcript = useTranscript(callId, query.data?.transcriptState === 'ready')
  if (role === null) {
    return null
  }
  const back = (
    <p>
      <Link to='/calls'>Back to Call history</Link>
    </p>
  )
  if (query.isError) {
    return (
      <>
        <PageHeader eyebrow='Calls' title='Call' />
        <Banner kind='error'>{presentCallHistory(query.error).message}</Banner>
        {back}
      </>
    )
  }
  const call = query.data
  if (call === undefined) {
    return <PageHeader eyebrow='Calls' title='Call' description='Loading...' />
  }
  return (
    <>
      <PageHeader
        eyebrow={call.direction === 'inbound' ? 'Inbound Call' : 'Outbound Call'}
        title={<Untrusted value={call.prospectNumber} />}
        description={
          <>
            {CALL_STATE_WORD[call.state] ?? call.state} · <When iso={call.createdAt} /> ·{' '}
            {formatDuration(call.durationSeconds)}
          </>
        }
      />
      {back}
      <p role='status' className='notice'>
        {feedback.notice}
      </p>
      <div className='flex flex-col gap-12'>
        <p className='hint'>
          {call.disclosure.aiAssisted
            ? 'AI-assisted. The Prospect was told so and that the Call is recorded.'
            : 'The Prospect was told the Call is recorded.'}
        </p>
        <Section id='wrap-up' title='Wrap-up'>
          {call.endedAt === null ? (
            <p className='hint'>You can wrap the Call up once it has ended.</p>
          ) : can.wrapUpCalls(role) ? (
            <WrapUp
              key={`${call.dealId}|${call.note}`}
              call={call}
              onStored={(next) => {
                store(next)
                feedback.done('Wrap-up saved.')
              }}
              onFail={feedback.failed}
            />
          ) : (
            <p className='hint'>
              Deal identifier: <Untrusted value={call.dealId ?? 'none'} />. Note:{' '}
              <Untrusted value={call.note ?? 'none'} />
            </p>
          )}
        </Section>
        <Section id='transcript' title='Transcript'>
          {call.transcriptState === 'ready' ? (
            <Paged
              noun='turns'
              emptyText='The Transcript is empty.'
              state={transcript.state}
              present={presentCallHistory}
            >
              <ol className='m-0 list-none divide-y border-y p-0' aria-label='Transcript'>
                {transcript.items.map((turn) => (
                  <li key={`${turn.startMs}-${turn.speaker}`} className='py-3'>
                    <span className='label-mono block'>
                      {turn.speaker === 'rep' ? 'Rep' : 'Prospect'} · {formatOffset(turn.startMs)}
                    </span>
                    <Untrusted value={turn.text} />
                  </li>
                ))}
              </ol>
            </Paged>
          ) : (
            <p className='hint'>
              {call.transcriptState === 'deleted'
                ? 'The Transcript was deleted with the Recording.'
                : 'The Transcript is not ready yet.'}
            </p>
          )}
        </Section>
        <Section id='recording' title='Recording'>
          <Playback
            key={call.recordingState}
            callId={call.id}
            state={call.recordingState}
            canDelete={can.deleteRecording(role)}
            onDeleted={(next) => {
              store(next)
              feedback.done('Recording deleted.')
            }}
          />
        </Section>
      </div>
    </>
  )
}

function WrapUp(props: {
  readonly call: {
    readonly id: string
    readonly dealId: string | null
    readonly note: string | null
  }
  readonly onStored: (
    call: Awaited<ReturnType<ReturnType<typeof useApp>['callHistory']['wrapUp']>>
  ) => void
  readonly onFail: () => void
}) {
  const app = useApp()
  const [dealId, setDealId] = useState(props.call.dealId ?? '')
  const [note, setNote] = useState(props.call.note ?? '')
  const [errors, setErrors] = useState<{ dealId?: string; note?: string; form?: string }>({})
  const { formRef, bannerRef, focusFirstError } = useFocusOnError()
  const save = useSubmit<{ dealId: string | null; note: string | null }>(
    async (body) => props.onStored(await app.callHistory.wrapUp(props.call.id, body)),
    {
      onError: (failure) => {
        props.onFail()
        setErrors({ form: presentCallHistory(failure).message })
        focusFirstError()
      },
    }
  )
  return (
    <form
      ref={formRef}
      noValidate
      aria-label='Wrap up Call'
      className='max-w-xl'
      onSubmit={(event) => {
        event.preventDefault()
        if (save.pending) {
          return
        }
        props.onFail()
        const body = { dealId: dealId.trim() || null, note: note.trim() || null }
        const parsed = wrapUpRequestSchema.safeParse(body)
        if (!parsed.success) {
          const next: { dealId?: string; note?: string } = {}
          for (const issue of parsed.error.issues) {
            if (issue.path[0] === 'dealId') {
              next.dealId = 'The Deal identifier must be 128 characters or fewer.'
            } else if (issue.path[0] === 'note') {
              next.note = 'The note must be 2000 characters or fewer.'
            }
          }
          setErrors(next)
          focusFirstError()
          return
        }
        setErrors({})
        save.submit(body)
      }}
    >
      {errors.form ? (
        <Banner kind='error' innerRef={bannerRef}>
          {errors.form}
        </Banner>
      ) : null}
      <Field
        label='Deal identifier'
        value={dealId}
        error={errors.dealId}
        onChange={(event) => setDealId(event.target.value)}
      />
      <TextAreaField
        label='Note'
        rows={4}
        value={note}
        error={errors.note}
        onChange={(event) => setNote(event.target.value)}
      />
      <button type='submit' className='button' aria-disabled={save.pending}>
        {save.pending ? 'Saving...' : 'Save wrap-up'}
      </button>
    </form>
  )
}

function Playback(props: {
  readonly callId: string
  readonly state: 'none' | 'storing' | 'stored' | 'deleted'
  readonly canDelete: boolean
  readonly onDeleted: (
    call: Awaited<ReturnType<ReturnType<typeof useApp>['callHistory']['deleteRecording']>>
  ) => void
}) {
  const app = useApp()
  // The signed URL is a bearer credential: it lives only in this state and the audio element.
  const [link, setLink] = useState<RecordingPlayback | null>(null)
  const [expired, setExpired] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement>(null)
  const fail = (failure: unknown) => setError(presentCallHistory(failure).message)
  const fetchLink = useSubmit<void>(
    async () => {
      setError(null)
      setExpired(false)
      setLink(await app.callHistory.recording(props.callId))
    },
    { onError: fail }
  )
  const remove = useSubmit<void>(
    async () => {
      setError(null)
      const call = await app.callHistory.deleteRecording(props.callId)
      setLink(null)
      props.onDeleted(call)
    },
    { onError: fail }
  )
  useEffect(() => {
    if (link === null) {
      return
    }
    const wait = Math.min(Math.max(Date.parse(link.expiresAt) - Date.now(), 0), MAX_TIMER_MS)
    const timer = setTimeout(() => {
      audio.current?.pause()
      setLink(null)
      setExpired(true)
    }, wait)
    return () => clearTimeout(timer)
  }, [link])
  if (props.state === 'none') {
    return <p className='hint'>This Call has no Recording.</p>
  }
  if (props.state === 'deleted') {
    return <p className='hint'>The Recording was deleted.</p>
  }
  return (
    <div className='flex flex-col gap-4'>
      {props.state === 'storing' ? (
        <p className='hint'>The Recording is still being stored. Reload in a minute.</p>
      ) : null}
      {error ? (
        <p className='field-error' role='alert'>
          <strong>Error:</strong> {error}
        </p>
      ) : null}
      {expired ? <p role='status'>Playback link expired. Play again.</p> : null}
      {link ? (
        // biome-ignore lint/a11y/useMediaCaption: the Transcript below is the text of this audio
        <audio ref={audio} controls src={link.url} aria-label='Recording audio' />
      ) : null}
      <div className='row-actions'>
        {link === null && props.state === 'stored' ? (
          <button
            type='button'
            className='button'
            aria-disabled={fetchLink.pending}
            onClick={() => fetchLink.submit()}
          >
            {fetchLink.pending ? 'Loading...' : expired ? 'Play again' : 'Play Recording'}
          </button>
        ) : null}
        {props.canDelete ? (
          <Confirm
            label='Delete Recording'
            accessibleName='Delete Recording'
            pendingAccessibleName='Deleting Recording'
            pendingLabel='Deleting...'
            question='Delete this Recording and its Transcript? This cannot be undone.'
            tone='quiet-destructive'
            confirmLabel='Delete Recording'
            pending={remove.pending}
            onConfirm={() => remove.submit()}
          />
        ) : null}
      </div>
    </div>
  )
}
