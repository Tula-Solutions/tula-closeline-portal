import { ERRORS, PLAYBOOK_ERRORS } from 'tula-closeline-contract'
import { ApiError, CLIENT_ERRORS } from '~/api/errors'
import { presentManage, type ShownFailure } from '~/api/manage-messages'
import { waitPhrase } from '~/api/messages'
import { ACCEPTED_WORDS, MAX_UPLOAD_WORDS } from '~/data/documents'

/** Which call failed, where a code means more than one thing. */
export type DocumentAction = 'list' | 'upload' | 'delete' | 'restore'

function tryAgain(seconds: number | undefined): string {
  return seconds === undefined ? 'Try again shortly.' : `Try again in ${waitPhrase(seconds)}.`
}

/**
 * Turns a failure of a Playbook call into plain words, branching on the code. Codes this table
 * does not own (sign-in, role, server) fall back to the words for members and Teams.
 */
export function presentDocument(error: unknown, action: DocumentAction): ShownFailure {
  if (!(error instanceof ApiError)) {
    return presentManage(error)
  }
  switch (error.code) {
    case PLAYBOOK_ERRORS['document.unsupported_type'].code:
      return { message: `This file type is not supported. Use one of ${ACCEPTED_WORDS}.` }
    case PLAYBOOK_ERRORS['document.too_large'].code:
      return {
        message: `This file is larger than ${MAX_UPLOAD_WORDS}. Make it smaller or split it.`,
      }
    case PLAYBOOK_ERRORS['document.quota_exceeded'].code:
      return {
        message:
          'Your Organization has reached its limit on the number or total size of documents. Deleted documents count until they are purged, so deleting more does not free space at once.',
      }
    case PLAYBOOK_ERRORS['document.not_found'].code:
      return { message: 'That document no longer exists. Reload the list.' }
    case PLAYBOOK_ERRORS['document.not_restorable'].code:
      return {
        message:
          'This document was purged after its retention period and cannot be restored. Upload the file again.',
      }
    case ERRORS['request.invalid'].code:
      return action === 'upload'
        ? {
            message:
              'Closeline could not read that file. It may be empty or its name may not be valid.',
          }
        : presentManage(error)
    case ERRORS['request.too_large'].code:
      return {
        message: `That upload is too big to send. The limit is ${MAX_UPLOAD_WORDS} for a file.`,
      }
    case ERRORS['request.unsupported_media_type'].code:
      return {
        message:
          'The file could not be sent in a form Closeline reads. Reload the page and try again.',
      }
    case ERRORS['rate.limited'].code:
      return { message: `Too many tries. ${tryAgain(error.retryAfterSeconds)}` }
    case ERRORS['server.unavailable'].code:
      return { message: `Closeline is busy right now. ${tryAgain(error.retryAfterSeconds)}` }
    case ERRORS['server.timeout'].code:
    case CLIENT_ERRORS.timeout:
      return action === 'upload'
        ? {
            message:
              'The upload took too long. It may still have been stored, so check the list, then retry: retrying does not store it twice.',
          }
        : presentManage(error)
    case CLIENT_ERRORS.network:
      return action === 'upload'
        ? {
            message:
              'Could not reach Closeline. The file may or may not have arrived: check your connection, then retry; retrying does not store it twice.',
          }
        : presentManage(error)
    default:
      return presentManage(error)
  }
}
