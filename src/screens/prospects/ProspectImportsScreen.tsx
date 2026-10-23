import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { type DragEvent, useEffect, useState } from 'react'
import { PageHeader } from '~/components/app/page-header'
import { StatusBadge } from '~/components/app/status-badge'
import {
  MAX_IMPORT_WORDS,
  MAX_ROWS_WORDS,
  PROSPECT_IMPORT_PENDING_STATES,
  prospectImportStateLabel,
  prospectImportTemplate,
} from '~/data/prospect-imports'
import { useProspectImports } from '~/data/queries'
import { SALES_POLL_SCHEDULE_MS } from '~/data/sales-history'
import { useDownloadUrl } from '~/data/use-download-url'
import { usePendingPoll } from '~/data/use-pending-poll'
import {
  type ProspectImportUploadState,
  useProspectImportUpload,
} from '~/data/use-prospect-import-upload'
import { Banner } from '~/ui/Banner'
import { Paged } from '~/ui/Paged'
import { plain } from '~/ui/plain'
import { ScrollRegion } from '~/ui/ScrollRegion'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { formatWhen, When } from '~/ui/When'
import { ImportSteps } from './ImportSteps'

const TEMPLATE = prospectImportTemplate()

/** Step 1 of a Prospect import: choose a file. Earlier imports are listed below, each one a link back to its progress or report. */
export function ProspectImportsScreen() {
  useDocumentTitle('Import Prospects')
  const imports = useProspectImports()
  const poll = usePendingPoll(
    imports.items
      .filter((item) => PROSPECT_IMPORT_PENDING_STATES.includes(item.state))
      .map((item) => item.id),
    imports.refetch,
    SALES_POLL_SCHEDULE_MS
  )
  return (
    <>
      <PageHeader
        eyebrow='Sales'
        title='Import Prospects'
        description='Upload a CSV with one row per Prospect. Each import gets a report that says what happened to every row.'
        actions={
          <Link to='/prospects' className='button button-quiet'>
            <ArrowLeft aria-hidden='true' className='size-4' />
            Prospects
          </Link>
        }
      />
      <ImportSteps current={0} />
      <TemplateLink />
      <UploadSection />
      {poll.paused ? (
        <Banner kind='info'>
          Some imports are still running, but we stopped checking for updates.{' '}
          <button type='button' className='button button-quiet' onClick={poll.resume}>
            Check again
          </button>
        </Banner>
      ) : null}
      <h2 className='mb-0 border-t border-rule-strong pt-4'>Imports</h2>
      <Paged
        noun='imports'
        emptyText='There are no imports yet.'
        emptyHint='Upload a CSV above; its progress and report show here.'
        state={imports.state}
      >
        <ScrollRegion label='Imports' bare>
          <table>
            <thead>
              <tr>
                <th scope='col'>Uploaded</th>
                <th scope='col'>Status</th>
                <th scope='col'>Rows</th>
                <th scope='col'>Created</th>
                <th scope='col'>Updated</th>
                <th scope='col'>Skipped</th>
                <th scope='col'>Rejected</th>
                <th scope='col'>Report</th>
              </tr>
            </thead>
            <tbody>
              {imports.items.map((item) => (
                <tr key={item.id}>
                  <th scope='row'>
                    <When iso={item.createdAt} />
                  </th>
                  <td>
                    <StatusBadge state={item.state}>
                      {prospectImportStateLabel(item.state)}
                    </StatusBadge>
                  </td>
                  <td>{item.rowCount ?? '-'}</td>
                  <td>{item.createdCount ?? '-'}</td>
                  <td>{item.updatedCount ?? '-'}</td>
                  <td>{item.skippedCount ?? '-'}</td>
                  <td>{item.rejectedCount ?? '-'}</td>
                  <td>
                    <Link to='/prospects/imports/$importId' params={{ importId: item.id }}>
                      Open
                      <span className='sr-only'>
                        {' '}
                        for the import of {formatWhen(item.createdAt)}
                      </span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </Paged>
    </>
  )
}

function TemplateLink() {
  const url = useDownloadUrl(TEMPLATE)
  return url === null ? null : (
    <p>
      <a href={url} download='prospect-import-template.csv'>
        Download the CSV template
      </a>
    </p>
  )
}

function UploadSection() {
  const upload = useProspectImportUpload()
  const navigate = useNavigate()
  const [over, setOver] = useState(false)
  const stored = upload.state.kind === 'stored' ? upload.state.importId : null
  useEffect(() => {
    if (stored !== null) {
      void navigate({ to: '/prospects/imports/$importId', params: { importId: stored } })
    }
  }, [stored, navigate])
  const take = (list: FileList | null) => {
    const file = list?.[0]
    if (file !== undefined) {
      void upload.choose(file)
    }
  }
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setOver(false)
    take(event.dataTransfer.files)
  }
  return (
    <section aria-labelledby='import-upload-heading' className='panel'>
      <h2 id='import-upload-heading'>Upload a CSV</h2>
      <fieldset
        className={over ? 'drop-area drop-area-over' : 'drop-area'}
        onDragOver={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <legend className='sr-only'>File to upload</legend>
        <label htmlFor='prospect-import-file'>Choose a CSV to upload</label>
        <input
          id='prospect-import-file'
          type='file'
          accept='.csv,text/csv'
          aria-describedby='prospect-import-hint'
          onChange={(event) => {
            take(event.target.files)
            event.target.value = ''
          }}
        />
        <p className='hint' id='prospect-import-hint'>
          Or drop it here. One .csv file at a time, up to {MAX_IMPORT_WORDS} and {MAX_ROWS_WORDS}{' '}
          rows, with the header from the template.
        </p>
      </fieldset>
      <div role='status' aria-label='Import upload'>
        <UploadResult state={upload.state} onRetry={upload.retry} />
      </div>
    </section>
  )
}

function UploadResult(props: {
  readonly state: ProspectImportUploadState
  readonly onRetry: () => void
}) {
  const { state } = props
  if (state.kind === 'idle') {
    return null
  }
  if (state.kind === 'uploading') {
    return (
      <p>
        Uploading <Untrusted value={state.name} />
        ...
      </p>
    )
  }
  if (state.kind === 'stored') {
    return (
      <p>
        Uploaded <Untrusted value={state.name} />. Opening its progress.
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
