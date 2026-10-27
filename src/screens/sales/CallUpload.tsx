import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  ACCEPTED_TRANSCRIPT_EXTENSIONS,
  checkCallFile,
  dealIdSchema,
  repChoiceSuits,
  speakerLabelSchema,
} from 'tula-closeline-contract'
import { useApp, useSessionState } from '~/app-context'
import { useRights } from '~/data/queries'
import { MAX_TRANSCRIPT_WORDS } from '~/data/sales-history'
import { type CallUploadState, useCallUpload } from '~/data/use-call-upload'
import { Field } from '~/ui/Field'
import { plain } from '~/ui/plain'
import { Untrusted } from '~/ui/Untrusted'
import { useFocusOnError } from '~/ui/useFocusOnError'

const ACCEPT = ACCEPTED_TRANSCRIPT_EXTENSIONS.join(',')
const EXTENSIONS = ACCEPTED_TRANSCRIPT_EXTENSIONS.join(', ')

type Problems = { file?: string; dealId?: string; rep?: string }

/** What is wrong with the chosen file before anything is sent, or null. A Recording is uploaded with the other form. */
function fileProblem(file: File): string | null {
  const checked = checkCallFile({
    fileName: file.name,
    declaredMediaType: file.type === '' ? null : file.type,
    sizeBytes: file.size,
  })
  if (!checked.ok) {
    if (checked.code === 'call.too_large') {
      return `This file is larger than ${MAX_TRANSCRIPT_WORDS}. Make it smaller or split the Call.`
    }
    if (checked.code === 'call.unsupported_type') {
      return `This file type is not supported. Upload a Transcript: ${EXTENSIONS}.`
    }
    return 'Closeline could not read that file. It may be empty or its name may not be valid.'
  }
  return checked.kind === 'transcript'
    ? null
    : `That is a Recording. Upload it with "Upload a Recording" below, or choose a Transcript: ${EXTENSIONS}.`
}

/**
 * The form that sends a Transcript for a Deal. The deal id and the Rep's speaker label go in the
 * multipart body. If the rights wording is not confirmed, the chosen file and fields are held in
 * memory (never in storage or an address) while the person confirms, then restored.
 */
export function CallUpload() {
  const app = useApp()
  const navigate = useNavigate()
  const session = useSessionState()
  const organizationId = session.status === 'signed_in' ? session.organization.id : ''
  const rights = useRights(true)
  const upload = useCallUpload()
  // Read once, then forgotten: the held file refills the form on the return trip only.
  const [draft] = useState(() => {
    const held = app.pendingCall.peek(organizationId)
    return held?.recording === undefined ? held : null
  })
  useEffect(() => {
    app.pendingCall.clear()
  }, [app])
  const [file, setFile] = useState<File | null>(draft?.file ?? null)
  const [dealId, setDealId] = useState(draft?.dealId ?? '')
  const [repLabel, setRepLabel] = useState(draft?.repLabel ?? '')
  const [problems, setProblems] = useState<Problems>({})
  // Bumped after a stored upload so the file chooser, which keeps its own file, starts empty.
  const [chooser, setChooser] = useState(0)
  const { formRef, focusFirstError } = useFocusOnError()

  const goToRights = (call: { file: File; dealId: string; repLabel: string }) => {
    app.pendingCall.hold({ organizationId, ...call })
    void navigate({ to: '/sales-history/rights', search: { from: '/sales-history/calls' } })
  }

  const submit = async () => {
    upload.clear()
    const found: Problems = {}
    const fileText = file === null ? 'Choose a Transcript file.' : fileProblem(file)
    if (fileText !== null) {
      found.file = fileText
    }
    const deal = dealIdSchema.safeParse(dealId)
    if (!deal.success) {
      found.dealId =
        'Enter the deal id exactly as it is in your CRM or CSV: 1 to 128 characters, with no control characters.'
    }
    const label = speakerLabelSchema.safeParse(repLabel)
    if (
      !label.success ||
      !repChoiceSuits('transcript', { by: 'speaker', label: label.data }, 'upload')
    ) {
      found.rep = "Enter the Rep's name exactly as it appears in the Transcript."
    }
    setProblems(found)
    if (found.file !== undefined || !deal.success || !label.success || file === null) {
      focusFirstError()
      return
    }
    const call = { file, dealId: deal.data, repLabel: label.data }
    const toSend = { file, dealId: deal.data, rep: { by: 'speaker', label: label.data } } as const
    // Known to be unconfirmed: do not send the file only to be refused.
    if (rights.data !== undefined && !rights.data.confirmed) {
      goToRights(call)
      return
    }
    const result = await upload.send(toSend)
    if (result === 'rights') {
      goToRights(call)
    } else if (result === 'accepted') {
      app.pendingCall.clear()
      setFile(null)
      setChooser((now) => now + 1)
      setDealId('')
      setRepLabel('')
    }
  }

  return (
    <section aria-labelledby='call-upload-heading' className='panel'>
      <h2 id='call-upload-heading'>Upload a Transcript</h2>
      <form
        ref={formRef}
        noValidate
        aria-labelledby='call-upload-heading'
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Field
          key={chooser}
          type='file'
          label='Choose a Transcript to upload'
          accept={ACCEPT}
          error={problems.file}
          hint={`${EXTENSIONS}, up to ${MAX_TRANSCRIPT_WORDS}. For a Recording, use the form below.`}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null)
            upload.clear()
            setProblems((now) => ({ ...now, file: undefined }))
          }}
        />
        {file === null || problems.file !== undefined ? null : (
          <p className='hint'>{`${plain(file.name, 'file')} is ready to upload.`}</p>
        )}
        <Field
          label="Customer's deal id"
          name='dealId'
          autoComplete='off'
          value={dealId}
          error={problems.dealId}
          hint='A Call for a deal id Closeline has not seen creates an open Deal.'
          onChange={(event) => {
            setDealId(event.target.value)
            setProblems((now) => ({ ...now, dealId: undefined }))
          }}
        />
        <Field
          label="Rep's speaker label"
          name='repLabel'
          autoComplete='off'
          value={repLabel}
          error={problems.rep}
          hint="The name or label the Rep has in the Transcript, for example 'Sam' or 'Speaker 1'."
          onChange={(event) => {
            setRepLabel(event.target.value)
            setProblems((now) => ({ ...now, rep: undefined }))
          }}
        />
        <button type='submit' className='button' aria-disabled={upload.state.kind === 'uploading'}>
          Upload Transcript
        </button>
      </form>
      <div role='status' aria-label='Call upload'>
        <UploadResult state={upload.state} onRetry={upload.retry} onCancel={upload.cancel} />
      </div>
    </section>
  )
}

/** What an upload is doing now and how it ended, with a retry when trying again is safe. */
export function UploadResult(props: {
  readonly state: CallUploadState
  readonly onRetry: () => void
  readonly onCancel: () => void
}) {
  const { state } = props
  if (state.kind === 'idle') {
    return null
  }
  if (state.kind === 'uploading') {
    // The sentence changes at quarter steps only, because this is a live region; the bar
    // beside it carries the exact value without being announced at every change.
    const quarter =
      state.progress === null || state.progress.total === 0
        ? 0
        : Math.min(100, Math.floor((state.progress.sent / state.progress.total) * 4) * 25)
    return (
      <>
        <p>
          Uploading <Untrusted value={state.name} />
          {quarter === 0 ? '...' : `: ${quarter}% sent`}
        </p>
        {state.progress === null ? null : (
          <progress
            aria-label={`Upload of ${plain(state.name, 'file')}`}
            value={state.progress.sent}
            max={state.progress.total}
          />
        )}
        <button
          type='button'
          className='button button-quiet'
          aria-label={`Cancel upload of ${plain(state.name, 'file')}`}
          onClick={props.onCancel}
        >
          Cancel
        </button>
      </>
    )
  }
  if (state.kind === 'stored') {
    return (
      <p>
        Uploaded <Untrusted value={state.name} />. It appears in the list below and is processed in
        the background.
      </p>
    )
  }
  if (state.kind === 'cancelled') {
    return (
      <p>
        Cancelled the upload of <Untrusted value={state.name} />. If it had already arrived, it will
        appear in the list below.
      </p>
    )
  }
  if (state.kind === 'duplicate') {
    return (
      <p>
        <Untrusted value={state.name} /> was already uploaded for this Deal, so nothing new was
        stored.
      </p>
    )
  }
  return (
    <>
      <p className='field-error'>
        <strong>Error:</strong> <Untrusted value={state.name} />: {state.message}
      </p>
      {state.retry ? (
        <button
          type='button'
          className='button button-quiet'
          aria-disabled={state.waiting}
          aria-label={`Retry ${plain(state.name, 'file')}`}
          onClick={props.onRetry}
        >
          Retry
        </button>
      ) : null}
    </>
  )
}
