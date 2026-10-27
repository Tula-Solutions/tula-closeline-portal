import type { SourcePerformance, Touch } from 'tula-closeline-contract'
import { idTail } from '~/screens/assessments/words'

/** A Playbook source in words: which Moment of which Call, or which page of which Document. Ids only, never text. */
export function sourceWord(source: SourcePerformance['source']): string {
  if (source.kind === 'moment') {
    const which = source.momentIndex === undefined ? 'A Moment' : `Moment ${source.momentIndex + 1}`
    return `${which} of Call ${idTail(source.callId)}`
  }
  return source.page === null
    ? `Document ${idTail(source.documentId)}`
    : `Document ${idTail(source.documentId)}, page ${source.page}`
}

/** What a touch was. */
export function touchKindWord(touch: Touch): string {
  return touch.kind === 'message' ? 'Message' : 'Call'
}

/** Which credit a touch carries, in plain words. */
export function creditWord(credit: Touch['credit']): string {
  if (credit.firstTouch && credit.lastTouch) {
    return 'First and last touch'
  }
  if (credit.firstTouch) {
    return 'First touch'
  }
  return credit.lastTouch ? 'Last touch' : 'No credit'
}
