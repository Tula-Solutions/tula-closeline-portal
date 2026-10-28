import { CODES } from './codes.ts'

/** Plain words for a Chat error code, branching on the code and never the status. */
export function wordsFor(code: string): { readonly text: string; readonly ended: boolean } {
  switch (code) {
    case CODES.originNotAllowed:
    case CODES.keyInvalid:
      return { text: 'Chat is not available on this site.', ended: true }
    case CODES.sessionClosed:
    case CODES.sessionNotFound:
      return { text: 'This chat has ended. Reload the page to start a new one.', ended: true }
    case CODES.invalid:
      return { text: 'That message could not be sent. Shorten it and try again.', ended: false }
    case CODES.rateLimited:
      return { text: 'Too many messages. Try again in a minute.', ended: false }
    default:
      return { text: 'Chat could not be reached. Try again in a moment.', ended: false }
  }
}
