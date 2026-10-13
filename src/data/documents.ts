import {
  ACCEPTED_DOCUMENT_EXTENSIONS,
  type DocumentFailureReason,
  type DocumentMediaType,
  type DocumentState,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_PAGES,
} from 'tula-closeline-contract'

/** The words for each state a document can be in. */
export const STATE_LABEL: Record<DocumentState, string> = {
  uploaded: 'Uploaded, waiting to be processed',
  processing: 'Being processed',
  ready: 'Ready',
  failed: 'Failed',
  deleted: 'Deleted',
}

/** The short name of each state, for the filter. */
export const FILTER_LABEL: Record<DocumentState, string> = {
  uploaded: 'Uploaded',
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
  deleted: 'Deleted (can be restored)',
}

/** The kind of file, in plain words, for each media type the service stores. */
export const TYPE_LABEL: Record<DocumentMediaType, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  'text/plain': 'Text',
  'text/markdown': 'Markdown',
}

/** What to tell a person whose document failed, and what to do about it. The contract gives a closed list of reasons, never free text. */
export const FAILURE_WORDS: Record<DocumentFailureReason, string> = {
  too_many_pages: `This document has more than ${MAX_DOCUMENT_PAGES} pages. Split it into smaller files and upload them.`,
  unreadable:
    'We could not read this file. Check that it opens on your computer, then upload a fixed copy.',
  password_protected: 'This file is password protected. Remove the password and upload it again.',
  no_text:
    'We found no text in this file. It may be scanned pages; upload a version with text you can select.',
  processing_failed:
    'Something went wrong while processing this file. Upload it again; if it keeps failing, contact support.',
}

/** The largest upload, in the words used in messages ("25 MB"). */
export const MAX_UPLOAD_WORDS = `${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB`

/** The accepted extensions as a list for people (".pdf, .docx, ..."). */
export const ACCEPTED_WORDS = ACCEPTED_DOCUMENT_EXTENSIONS.join(', ')

/** A size in bytes in plain words: "900 bytes", "12.5 KB", "3.0 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * How long to wait before asking again about documents that are still being processed: it grows
 * so a long ingestion does not mean a steady stream of requests, stays at 30 seconds at most, and
 * ends after about ten minutes (the person can ask again). It starts over whenever something changes.
 */
export const POLL_SCHEDULE_MS: readonly number[] = [
  2_000,
  4_000,
  8_000,
  15_000,
  ...Array.from({ length: 18 }, () => 30_000),
]

/** States in which a document is still on its way somewhere, so its state is worth asking about again. */
export const PENDING_STATES: readonly DocumentState[] = ['uploaded', 'processing']
