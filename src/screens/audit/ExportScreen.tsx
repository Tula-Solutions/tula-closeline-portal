import { useState } from 'react'
import type { ExportFailureReason, ExportJob, ExportPart } from 'tula-closeline-contract'
import { presentExport } from '~/api/audit-messages'
import { fingerprint } from '~/api/idempotency'
import { outcomeUnknown } from '~/api/manage-messages'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import { Section } from '~/components/app/section'
import { StatusBadge } from '~/components/app/status-badge'
import { can } from '~/data/permissions'
import { refresh, useExports } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { Banner } from '~/ui/Banner'
import { Paged } from '~/ui/Paged'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useFeedback } from '~/ui/useFeedback'
import { useSubmit } from '~/ui/useSubmit'
import { When } from '~/ui/When'

const STATE_WORD = {
  queued: 'Queued',
  running: 'Running',
  ready: 'Ready',
  failed: 'Failed',
  expired: 'Expired',
} as const satisfies Record<ExportJob['state'], string>

const FAILURE_WORD = {
  part_failed: 'A part of the export could not be written, so nothing was packaged.',
  timed_out: 'The export took too long and was stopped.',
  storage_unavailable: 'Export storage was not available. Nothing was packaged.',
} as const satisfies Record<ExportFailureReason, string>

const SERVICE_WORD = {
  core: 'Organization data',
  playbook: 'Playbook',
  voice: 'Calls',
  outbound: 'Campaigns',
} as const satisfies Record<ExportPart['service'], string>

const PART_WORD = { pending: 'Waiting', ready: 'Done', failed: 'Failed' } as const

/** The Organization data export; only an Owner or Admin can ask for one, and nobody else sees the page. */
export function ExportScreen() {
  useDocumentTitle('Data export')
  const role = useRole()
  if (role === null) {
    return null
  }
  if (!can.manageExports(role)) {
    return (
      <>
        <PageHeader eyebrow='Organization' title='Data export' />
        <p role='status' className='notice'>
          Only an Owner or Admin can export the Organization's data. Ask one of them if you need a
          copy.
        </p>
      </>
    )
  }
  return <ExportAdmin />
}

function ExportAdmin() {
  const exportsList = useExports(true)
  const feedback = useFeedback()
  const now = Date.now()
  return (
    <>
      <PageHeader
        eyebrow='Organization'
        title='Data export'
        description='A copy of everything your Organization holds, packaged for you to keep. A download link lasts a day and is made when you press Download.'
      />
      <div className='grid items-start gap-12 lg:grid-cols-12'>
        <Section
          id='request-export'
          title='Ask for an export'
          description='Two exports are allowed in 24 hours, and one can run at a time.'
          className='lg:sticky lg:top-8 lg:order-2 lg:col-span-4'
        >
          <RequestForm onDone={feedback.done} onFail={feedback.failed} />
        </Section>
        <div className='flex min-w-0 flex-col gap-4 lg:order-1 lg:col-span-8'>
          <p role='status' className='notice'>
            {feedback.notice}
          </p>
          <h2 className='m-0 border-t border-rule-strong pt-4'>Exports</h2>
          <Paged
            noun='exports'
            emptyText='Nothing has been exported yet.'
            emptyHint='Ask for the first export with the form on this page.'
            state={exportsList.state}
            present={presentExport}
          >
            <ul
              className='m-0 list-none divide-y border-y p-0 motion-safe:animate-fade'
              aria-label='Exports'
            >
              {exportsList.items.map((job) => (
                <ExportItem key={job.id} job={job} now={now} onFail={feedback.failed} />
              ))}
            </ul>
          </Paged>
        </div>
      </div>
    </>
  )
}

function RequestForm(props: {
  readonly onDone: (notice: string) => void
  readonly onFail: () => void
}) {
  const app = useApp()
  const [recordings, setRecordings] = useState(false)
  const [error, setError] = useState('')
  const request = useSubmit<boolean>(
    async (includeRecordingLinks) => {
      const body = { kind: 'organization' as const, includeRecordingLinks }
      const attempt = app.keys.begin(fingerprint.exportRequest(JSON.stringify(body)))
      try {
        await app.exports.requestExport(body, attempt.key)
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      setError('')
      props.onDone('Export requested. It appears below and updates by itself.')
      await refresh(app, 'exports')
    },
    {
      onError(failure) {
        props.onFail()
        setError(presentExport(failure).message)
      },
    }
  )
  return (
    <form
      noValidate
      aria-label='Ask for an export'
      onSubmit={(event) => {
        event.preventDefault()
        props.onFail()
        setError('')
        request.submit(recordings)
      }}
    >
      {error === '' ? null : <Banner kind='error'>{error}</Banner>}
      <div className='field'>
        <label htmlFor='export-recordings'>
          <input
            id='export-recordings'
            type='checkbox'
            checked={recordings}
            onChange={(event) => setRecordings(event.target.checked)}
          />{' '}
          Include links to call recordings
        </label>
        <p className='hint'>
          The links are listed in the export. Anyone who holds the file can follow them, so keep it
          safe.
        </p>
      </div>
      <button type='submit' className='button' disabled={request.pending}>
        {request.pending ? 'Requesting...' : 'Request export'}
      </button>
    </form>
  )
}

function ExportItem(props: {
  readonly job: ExportJob
  readonly now: number
  readonly onFail: () => void
}) {
  const { job } = props
  const lapsed =
    job.state === 'ready' && job.expiresAt !== null && Date.parse(job.expiresAt) <= props.now
  const state = lapsed ? 'expired' : job.state
  return (
    <li className='export-item'>
      <div className='key-head'>
        <span>
          Asked for <When iso={job.requestedAt} />
        </span>
        <StatusBadge state={state}>{STATE_WORD[state]}</StatusBadge>
      </div>
      {job.includeRecordingLinks ? (
        <p className='hint'>Includes links to call recordings.</p>
      ) : null}
      {state === 'queued' || state === 'running' ? (
        <>
          <Parts parts={job.parts} />
          <p className='hint'>This page checks again by itself every few seconds.</p>
        </>
      ) : null}
      {state === 'failed' ? (
        <>
          <Parts parts={job.parts} />
          <p className='export-reason'>
            {job.failureReason === null
              ? 'The export did not finish.'
              : FAILURE_WORD[job.failureReason]}{' '}
            Ask for a new one.
          </p>
        </>
      ) : null}
      {state === 'ready' ? (
        <>
          {job.expiresAt === null ? null : (
            <p className='hint'>
              Ready to download until <When iso={job.expiresAt} />.
            </p>
          )}
          <DownloadButton exportId={job.id} onFail={props.onFail} />
        </>
      ) : null}
      {state === 'expired' ? (
        <p className='export-reason'>This export has expired. Ask for a new one.</p>
      ) : null}
    </li>
  )
}

function Parts(props: { readonly parts: readonly ExportPart[] }) {
  if (props.parts.length === 0) {
    return <p className='hint'>Waiting to start.</p>
  }
  return (
    <ul className='export-parts' aria-label='Parts'>
      {props.parts.map((part) => (
        <li key={part.service}>
          <span>{SERVICE_WORD[part.service]}</span>
          <span>{PART_WORD[part.state]}</span>
        </li>
      ))}
    </ul>
  )
}

function DownloadButton(props: { readonly exportId: string; readonly onFail: () => void }) {
  const app = useApp()
  const [error, setError] = useState('')
  const download = useSubmit<string>(
    async (exportId) => {
      const attempt = app.keys.begin(fingerprint.exportDownload(exportId))
      let link: Awaited<ReturnType<typeof app.exports.createDownloadLink>>
      try {
        link = await app.exports.createDownloadLink(exportId, attempt.key)
      } catch (failure) {
        attempt.failed(failure)
        if (!outcomeUnknown(failure)) {
          await refresh(app, 'exports')
        }
        throw failure
      }
      attempt.succeeded()
      setError('')
      // The address is used once, here, and is never kept, shown or logged.
      app.assign(link.url)
    },
    {
      onError(failure) {
        props.onFail()
        setError(presentExport(failure).message)
      },
    }
  )
  return (
    <>
      {error === '' ? null : <Banner kind='error'>{error}</Banner>}
      <div className='row-actions'>
        <button
          type='button'
          className='button'
          disabled={download.pending}
          onClick={() => download.submit(props.exportId)}
        >
          {download.pending ? 'Preparing...' : 'Download'}
        </button>
      </div>
    </>
  )
}
