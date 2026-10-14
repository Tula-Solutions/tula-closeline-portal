import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  ACCEPTED_RECORDING_EXTENSIONS,
  checkCallFile,
  dealIdSchema,
  MAX_RECORDING_BYTES,
  type RepChoice,
  repChoiceSuits,
} from 'tula-closeline-contract'
import { useApp, useSessionState } from '~/app-context'
import { useRights } from '~/data/queries'
import { MAX_RECORDING_WORDS } from '~/data/sales-history'
import { useCallUpload } from '~/data/use-call-upload'
import { UploadResult } from '~/screens/sales/CallUpload'
import { Field } from '~/ui/Field'
import { plain } from '~/ui/plain'
import { SelectField } from '~/ui/SelectField'
import { useFocusOnError } from '~/ui/useFocusOnError'

const ACCEPT = ACCEPTED_RECORDING_EXTENSIONS.join(',')
const EXTENSIONS = ACCEPTED_RECORDING_EXTENSIONS.join(', ')

type Channel = '' | 'left' | 'right'
type Problems = { file?: string; dealId?: string; rep?: string }

/** What is wrong with the chosen file before any of it is sent, or null. Only the name and size are read, never the content. */
function fileProblem(file: File): string | null {
  // The size check comes first and needs no bytes: the contract's check runs on name, type and size.
  if (file.size > MAX_RECORDING_BYTES) {
    return `This Recording is larger than ${MAX_RECORDING_WORDS}. Make it smaller or split the Call.`
  }
  const checked = checkCallFile({
    fileName: file.name,
    declaredMediaType: file.type === '' ? null : file.type,
    sizeBytes: file.size,
  })
  if (!checked.ok) {
    return checked.code === 'call.unsupported_type'
      ? `This file type is not supported. Upload a Recording: ${EXTENSIONS}.`
      : 'Closeline could not read that file. It may be empty or its name may not be valid.'
  }
  return checked.kind === 'recording'
    ? null
    : 'That is a Transcript. Upload it with "Upload a Transcript" above, or choose a Recording.'
}

/** Why a Rep choice cannot go with a Recording upload (only a channel, or nothing, can), or null if it can. */
export function recordingRepProblem(rep: RepChoice | null): string | null {
  return repChoiceSuits('recording', rep, 'upload')
    ? null
    : 'A Recording is uploaded with a channel as the Rep, or with none. Pick the speaker after it is transcribed.'
}

/** The Rep choice a Recording is sent with: a channel, or none so that the Rep is picked after transcription. */
function repOf(channel: Channel): RepChoice | null {
  return channel === '' ? null : { by: 'channel', channel }
}

/**
 * The form that sends a Recording for a Deal (Owner and Admin only, like the Transcript form).
 * The browser streams the chosen file from disk; the page never reads its bytes. The deal id and
 * the optional Rep channel go in the multipart body before the file. With no channel, the Call
 * waits for a Rep to be picked once it has been transcribed. If the rights wording is not
 * confirmed, the choice is held in memory while the person confirms, then restored.
 */
export function RecordingUpload() {
  const app = useApp()
  const navigate = useNavigate()
  const session = useSessionState()
  const organizationId = session.status === 'signed_in' ? session.organization.id : ''
  const rights = useRights(true)
  const upload = useCallUpload('recording')
  const [draft] = useState(() => {
    const held = app.pendingCall.peek(organizationId)
    return held?.recording === undefined ? null : held
  })
  useEffect(() => {
    app.pendingCall.clear()
  }, [app])
  const [file, setFile] = useState<File | null>(draft?.file ?? null)
  const [dealId, setDealId] = useState(draft?.dealId ?? '')
  const [channel, setChannel] = useState<Channel>(draft?.recording?.channel ?? '')
  const [problems, setProblems] = useState<Problems>({})
  const { formRef, focusFirstError } = useFocusOnError()

  const goToRights = (held: { file: File; dealId: string }) => {
    app.pendingCall.hold({ organizationId, ...held, repLabel: '', recording: { channel } })
    void navigate({ to: '/sales-history/rights', search: { from: '/sales-history/calls' } })
  }

  const submit = async () => {
    const found: Problems = {}
    const fileText = file === null ? 'Choose a Recording.' : fileProblem(file)
    if (fileText !== null) {
      found.file = fileText
    }
    const deal = dealIdSchema.safeParse(dealId)
    if (!deal.success) {
      found.dealId =
        'Enter the deal id exactly as it is in your CRM or CSV: 1 to 128 characters, with no control characters.'
    }
    const rep = repOf(channel)
    const repText = recordingRepProblem(rep)
    if (repText !== null) {
      found.rep = repText
    }
    setProblems(found)
    if (found.file !== undefined || found.rep !== undefined || !deal.success || file === null) {
      focusFirstError()
      return
    }
    const held = { file, dealId: deal.data }
    // Known to be unconfirmed: do not send the file only to be refused.
    if (rights.data !== undefined && !rights.data.confirmed) {
      goToRights(held)
      return
    }
    const result = await upload.send({ ...held, rep })
    if (result === 'rights') {
      goToRights(held)
    } else if (result === 'accepted') {
      app.pendingCall.clear()
      setFile(null)
      setDealId('')
      setChannel('')
    }
  }

  return (
    <section aria-labelledby='recording-upload-heading'>
      <h2 id='recording-upload-heading'>Upload a Recording</h2>
      <form
        ref={formRef}
        noValidate
        aria-labelledby='recording-upload-heading'
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Field
          type='file'
          label='Choose a Recording to upload'
          accept={ACCEPT}
          error={problems.file}
          hint={`${EXTENSIONS}, up to ${MAX_RECORDING_WORDS}. Closeline transcribes it, which can take a few minutes.`}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null)
            setProblems((now) => ({ ...now, file: undefined }))
          }}
        />
        {file === null ? null : (
          <p className='hint'>{`${plain(file.name, 'file')} is ready to upload.`}</p>
        )}
        <Field
          label="Customer's deal id for the Recording"
          name='recordingDealId'
          autoComplete='off'
          value={dealId}
          error={problems.dealId}
          hint='A Call for a deal id Closeline has not seen creates an open Deal. The id is sent in the request body, never in the address.'
          onChange={(event) => {
            setDealId(event.target.value)
            setProblems((now) => ({ ...now, dealId: undefined }))
          }}
        />
        <SelectField
          label='Which channel is the Rep?'
          name='recordingRep'
          error={problems.rep}
          value={channel}
          onChange={(event) => {
            const value = event.target.value
            setChannel(value === 'left' || value === 'right' ? value : '')
            setProblems((now) => ({ ...now, rep: undefined }))
          }}
          options={[
            { value: '', text: 'Not sure: I will pick the Rep after it is transcribed' },
            { value: 'left', text: 'Left channel' },
            { value: 'right', text: 'Right channel' },
          ]}
        />
        <p className='hint'>
          Choose a channel only if the Recording has the Rep alone on one side and the customer on
          the other. If it does not, the Call fails and picking a speaker as the Rep fixes it.
        </p>
        <button type='submit' className='button' aria-disabled={upload.state.kind === 'uploading'}>
          Upload Recording
        </button>
      </form>
      <div role='status' aria-label='Recording upload'>
        <UploadResult state={upload.state} onRetry={upload.retry} onCancel={upload.cancel} />
      </div>
    </section>
  )
}
