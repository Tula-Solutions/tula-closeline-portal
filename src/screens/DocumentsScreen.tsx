import { type DragEvent, type RefObject, useRef, useState } from 'react'
import {
  ACCEPTED_DOCUMENT_EXTENSIONS,
  type DocumentState,
  documentStateSchema,
  type PlaybookDocument,
} from 'tula-closeline-contract'
import { presentDocument } from '~/api/playbook-messages'
import { useApp } from '~/app-context'
import { PageHeader } from '~/components/app/page-header'
import {
  FILTER_LABEL,
  failureWords,
  formatBytes,
  MAX_UPLOAD_WORDS,
  PENDING_STATES,
  stateLabel,
  typeLabel,
} from '~/data/documents'
import { can } from '~/data/permissions'
import { refresh, useDocuments } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { usePendingPoll } from '~/data/use-pending-poll'
import { type UploadEntry, useUploads } from '~/data/use-uploads'
import { Banner } from '~/ui/Banner'
import { Confirm } from '~/ui/Confirm'
import { Paged } from '~/ui/Paged'
import { plain } from '~/ui/plain'
import { ScrollRegion } from '~/ui/ScrollRegion'
import { SelectField } from '~/ui/SelectField'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { useSubmit } from '~/ui/useSubmit'

const DATE = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const ACCEPT = ACCEPTED_DOCUMENT_EXTENSIONS.join(',')

function When(props: { readonly iso: string }) {
  const time = Date.parse(props.iso)
  return <time dateTime={props.iso}>{Number.isNaN(time) ? props.iso : DATE.format(time)}</time>
}

/** The Playbook: the documents an Organization's sales knowledge comes from. Everyone reads them; Owners and Admins upload, delete and restore. */
export function DocumentsScreen() {
  useDocumentTitle('Playbook')
  const app = useApp()
  const role = useRole()
  const session = app.session.getSnapshot()
  if (role === null || session.status !== 'signed_in') {
    return null
  }
  // Keyed by Organization, so a switch drops this screen's filter, uploads and notices with it.
  return <DocumentsView key={session.organization.id} manage={can.managePlaybook(role)} />
}

function DocumentsView(props: { readonly manage: boolean }) {
  const [filter, setFilter] = useState<DocumentState | undefined>(undefined)
  const [notice, setNotice] = useState('')
  const documents = useDocuments(filter)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const poll = usePendingPoll(
    documents.items.filter((item) => PENDING_STATES.includes(item.state)).map((item) => item.id),
    documents.refetch
  )
  return (
    <>
      <PageHeader
        title='Playbook'
        description="The documents your Organization's sales knowledge comes from."
        headingRef={headingRef}
        headingProps={{ tabIndex: -1 }}
      />
      {props.manage ? <UploadSection /> : null}
      <SelectField
        label='Show'
        name='state'
        value={filter ?? ''}
        onChange={(event) => {
          const parsed = documentStateSchema.safeParse(event.target.value)
          setFilter(parsed.success ? parsed.data : undefined)
          setNotice('')
        }}
        options={[
          { value: '', text: 'All current documents' },
          ...documentStateSchema.options.map((state) => ({
            value: state,
            text: FILTER_LABEL[state],
          })),
        ]}
      />
      <p role='status' aria-label='Notice' className='notice'>
        {notice}
      </p>
      {poll.paused ? (
        <Banner kind='info'>
          Some documents are still being processed, but we stopped checking for updates.{' '}
          <button type='button' className='button button-quiet' onClick={poll.resume}>
            Check again
          </button>
        </Banner>
      ) : null}
      <Paged noun='documents' emptyText='There are no documents to show.' state={documents.state}>
        <ScrollRegion label='Documents'>
          <table>
            <thead>
              <tr>
                <th scope='col'>Name</th>
                <th scope='col'>Type</th>
                <th scope='col'>Size</th>
                <th scope='col'>Status</th>
                <th scope='col'>Pages</th>
                <th scope='col'>Added</th>
                {props.manage ? <th scope='col'>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {documents.items.map((document) => (
                <DocumentRow
                  key={document.id}
                  document={document}
                  manage={props.manage}
                  onDone={setNotice}
                  heading={headingRef}
                />
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </Paged>
    </>
  )
}

function DocumentRow(props: {
  readonly document: PlaybookDocument
  readonly manage: boolean
  readonly onDone: (notice: string) => void
  /** The page heading: focus goes there when this row leaves the list (deleted, or restored out of the deleted filter). */
  readonly heading: RefObject<HTMLHeadingElement | null>
}) {
  const { document } = props
  const app = useApp()
  const [error, setError] = useState<string | null>(null)
  const label = plain(document.fileName, 'document')
  const errorId = `${document.id}-error`

  const remove = useSubmit<void>(
    async () => {
      setError(null)
      const gone = await app.playbook.deleteDocument(document.id)
      await refresh(app, 'documents')
      props.onDone(
        gone.purgeAt === null
          ? `Deleted ${label}.`
          : `Deleted ${label}. You can restore it until ${DATE.format(Date.parse(gone.purgeAt))}.`
      )
      props.heading.current?.focus()
    },
    { onError: (failure) => setError(presentDocument(failure, 'delete').message) }
  )
  const restore = useSubmit<void>(
    async () => {
      setError(null)
      await app.playbook.restoreDocument(document.id)
      await refresh(app, 'documents')
      props.onDone(`Restored ${label}. It is being processed again.`)
      props.heading.current?.focus()
    },
    { onError: (failure) => setError(presentDocument(failure, 'restore').message) }
  )

  return (
    <tr>
      <th scope='row'>
        <Untrusted value={document.fileName} />
      </th>
      <td>{typeLabel(document.mediaType)}</td>
      <td>{formatBytes(document.sizeBytes)}</td>
      <td>
        <span>{stateLabel(document.state)}</span>
        {document.failureReason === null ? null : (
          <p className='hint'>{failureWords(document.failureReason)}</p>
        )}
        {document.state === 'deleted' && document.purgeAt !== null ? (
          <p className='hint'>
            Restorable until <When iso={document.purgeAt} />
          </p>
        ) : null}
      </td>
      <td>{document.pageCount ?? '-'}</td>
      <td>
        <When iso={document.createdAt} />
      </td>
      {props.manage ? (
        <td>
          {document.state === 'deleted' ? (
            <button
              type='button'
              className='button button-quiet'
              aria-disabled={restore.pending}
              aria-label={restore.pending ? `Restoring ${label}` : `Restore ${label}`}
              aria-describedby={error ? errorId : undefined}
              onClick={() => restore.submit()}
            >
              {restore.pending ? 'Restoring...' : 'Restore'}
            </button>
          ) : (
            <Confirm
              label='Delete'
              accessibleName={`Delete ${label}`}
              pendingAccessibleName={`Deleting ${label}`}
              pendingLabel='Deleting...'
              question={
                <>
                  Delete <Untrusted value={document.fileName} />? It is hidden at once and can be
                  restored for a while before it is removed for good.
                </>
              }
              confirmLabel='Delete document'
              pending={remove.pending}
              describedBy={error ? errorId : undefined}
              onConfirm={() => remove.submit()}
            />
          )}
          {error ? (
            <p className='field-error' id={errorId} role='alert'>
              <strong>Error:</strong> {error}
            </p>
          ) : null}
        </td>
      ) : null}
    </tr>
  )
}

function UploadSection() {
  const uploads = useUploads()
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const take = (list: FileList | null) => {
    if (list !== null && list.length > 0) {
      uploads.add([...list])
    }
  }
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setOver(false)
    take(event.dataTransfer.files)
  }
  return (
    <section aria-labelledby='upload-heading'>
      <h2 id='upload-heading'>Upload documents</h2>
      <fieldset
        data-testid='drop-area'
        className={over ? 'drop-area drop-area-over' : 'drop-area'}
        onDragOver={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <legend className='sr-only'>Files to upload</legend>
        <label htmlFor='playbook-files'>Choose files to upload</label>
        <input
          id='playbook-files'
          ref={input}
          type='file'
          multiple
          accept={ACCEPT}
          aria-describedby='upload-hint'
          onChange={(event) => {
            take(event.target.files)
            event.target.value = ''
          }}
        />
        <p className='hint' id='upload-hint'>
          Or drop files here. {ACCEPTED_DOCUMENT_EXTENSIONS.join(', ')}, up to {MAX_UPLOAD_WORDS}{' '}
          each.
        </p>
      </fieldset>
      <div role='status' aria-label='Uploads'>
        <ul className='plain-list'>
          {uploads.entries.map((entry) => (
            <UploadItem
              key={entry.id}
              entry={entry}
              onRetry={() => uploads.retry(entry.id)}
              onDismiss={() => uploads.dismiss(entry.id)}
            />
          ))}
        </ul>
      </div>
    </section>
  )
}

function UploadItem(props: {
  readonly entry: UploadEntry
  readonly onRetry: () => void
  readonly onDismiss: () => void
}) {
  const { entry } = props
  const { outcome } = entry
  const label = plain(entry.name, 'file')
  return (
    <li>
      {outcome.kind === 'queued' ? (
        <span>
          <Untrusted value={entry.name} /> is waiting to upload.
        </span>
      ) : null}
      {outcome.kind === 'uploading' ? (
        <span>
          Uploading <Untrusted value={entry.name} />
          ...
        </span>
      ) : null}
      {outcome.kind === 'stored' ? (
        <span>
          Uploaded <Untrusted value={outcome.storedName} />. It is waiting to be processed.
        </span>
      ) : null}
      {outcome.kind === 'duplicate' ? (
        <span>
          <Untrusted value={outcome.storedName} /> was already uploaded, so nothing new was stored.
        </span>
      ) : null}
      {outcome.kind === 'failed' ? (
        <>
          <p className='field-error'>
            <strong>Error:</strong> <Untrusted value={entry.name} />: {outcome.message}
          </p>
          {outcome.retry ? (
            <button
              type='button'
              className='button button-quiet'
              aria-disabled={outcome.waiting}
              aria-label={`Retry ${label}`}
              onClick={props.onRetry}
            >
              Retry
            </button>
          ) : null}
        </>
      ) : null}{' '}
      {outcome.kind === 'queued' || outcome.kind === 'uploading' ? null : (
        <button
          type='button'
          className='button button-quiet'
          aria-label={`Dismiss ${label}`}
          onClick={props.onDismiss}
        >
          Dismiss
        </button>
      )}
    </li>
  )
}
