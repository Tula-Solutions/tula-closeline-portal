import { Link } from '@tanstack/react-router'
import { type DragEvent, useState } from 'react'
import { MAX_DEAL_IMPORT_ROWS } from 'tula-closeline-contract'
import { PageHeader } from '~/components/app/page-header'
import { useDealImports } from '~/data/queries'
import {
  dealImportTemplate,
  IMPORT_PENDING_STATES,
  importStateLabel,
  MAX_IMPORT_WORDS,
  SALES_POLL_SCHEDULE_MS,
} from '~/data/sales-history'
import { useDownloadUrl } from '~/data/use-download-url'
import { type ImportUploadState, useImportUpload } from '~/data/use-import-upload'
import { usePendingPoll } from '~/data/use-pending-poll'
import { Banner } from '~/ui/Banner'
import { Paged } from '~/ui/Paged'
import { plain } from '~/ui/plain'
import { ScrollRegion } from '~/ui/ScrollRegion'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { formatWhen, When } from '~/ui/When'

const TEMPLATE = dealImportTemplate()

/** Deal imports: upload a CSV of Deals, then read each import's state and report. */
export function ImportsScreen() {
  useDocumentTitle('Deal imports')
  const imports = useDealImports()
  const poll = usePendingPoll(
    imports.items.filter((item) => IMPORT_PENDING_STATES.includes(item.state)).map((i) => i.id),
    imports.refetch,
    SALES_POLL_SCHEDULE_MS
  )
  return (
    <>
      <PageHeader
        title='Deal imports'
        description="Upload a CSV with one row per Deal to set each Deal's Outcome in bulk. Each import gets a report that says what happened to every row."
      />
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
      <h2>Imports</h2>
      <Paged noun='imports' emptyText='There are no imports yet.' state={imports.state}>
        <ScrollRegion label='Imports'>
          <table>
            <thead>
              <tr>
                <th scope='col'>Uploaded</th>
                <th scope='col'>Status</th>
                <th scope='col'>Rows</th>
                <th scope='col'>Applied</th>
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
                  <td>{importStateLabel(item.state)}</td>
                  <td>{item.rowCount ?? '-'}</td>
                  <td>{item.appliedCount ?? '-'}</td>
                  <td>{item.rejectedCount ?? '-'}</td>
                  <td>
                    {IMPORT_PENDING_STATES.includes(item.state) ? (
                      // There is no report until the import has been processed.
                      'Not ready yet'
                    ) : (
                      <Link to='/sales-history/imports/$importId' params={{ importId: item.id }}>
                        Report
                        <span className='sr-only'>
                          {' '}
                          for the import of {formatWhen(item.createdAt)}
                        </span>
                      </Link>
                    )}
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
      <a href={url} download='deal-import-template.csv'>
        Download the CSV template
      </a>
    </p>
  )
}

function UploadSection() {
  const upload = useImportUpload()
  const [over, setOver] = useState(false)
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
    <section aria-labelledby='import-upload-heading'>
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
        <label htmlFor='import-file'>Choose a CSV to upload</label>
        <input
          id='import-file'
          type='file'
          accept='.csv,text/csv'
          aria-describedby='import-hint'
          onChange={(event) => {
            take(event.target.files)
            event.target.value = ''
          }}
        />
        <p className='hint' id='import-hint'>
          Or drop it here. One .csv file at a time, up to {MAX_IMPORT_WORDS} and{' '}
          {MAX_DEAL_IMPORT_ROWS.toLocaleString('en-US')} rows, with the header from the template.
        </p>
      </fieldset>
      <div role='status' aria-label='Import upload'>
        <UploadResult state={upload.state} onRetry={upload.retry} />
      </div>
    </section>
  )
}

function UploadResult(props: { readonly state: ImportUploadState; readonly onRetry: () => void }) {
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
        Uploaded <Untrusted value={state.name} />. It is listed below and its report appears when it
        has been processed.
      </p>
    )
  }
  return (
    <>
      <p className='field-error'>
        <strong>Error:</strong> <Untrusted value={state.name} />: {state.message}
      </p>
      {state.rights ? (
        <p>
          <Link to='/sales-history/rights' search={{ from: '/sales-history/imports' }}>
            Confirm the rights wording
          </Link>
        </p>
      ) : null}
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
