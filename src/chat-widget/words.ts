import { CODES } from './codes.ts'

/**
 * The Consent Wording texts this widget can show, by version. The server names only an id and a
 * version; the text is the widget's own (contract `publicChatConsentWordingSchema`). A version
 * missing here is never shown, so no form appears for wording the widget cannot display.
 */
export const CONSENT_TEXT: Readonly<Record<number, string>> = {
  1: 'I agree that this company’s AI assistant may call me at this number about my request. The call comes from an AI and may be recorded. I can say stop at any time.',
}

/** Plain words for a Chat error code, branching on the code and never the status. */
export function wordsFor(
  code: string,
  about: 'message' | 'callback' = 'message'
): { readonly text: string; readonly ended: boolean } {
  switch (code) {
    case CODES.originNotAllowed:
    case CODES.keyInvalid:
      return { text: 'Chat is not available on this site.', ended: true }
    case CODES.sessionClosed:
    case CODES.sessionNotFound:
      return { text: 'This chat has ended. Reload the page to start a new one.', ended: true }
    case CODES.wordingMissing:
      return { text: 'The callback wording changed. Read it again and resubmit.', ended: false }
    case CODES.invalid:
      if (about === 'callback') {
        return { text: 'Check your name and phone number and try again.', ended: false }
      }
      return { text: 'That message could not be sent. Shorten it and try again.', ended: false }
    case CODES.rateLimited:
      return { text: 'Too many messages. Try again in a minute.', ended: false }
    default:
      return { text: 'Chat could not be reached. Try again in a moment.', ended: false }
  }
}
