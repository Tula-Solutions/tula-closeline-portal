/** A length in seconds as minutes and seconds, such as "3:07"; a Call with no length yet is a dash. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return '-'
  }
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

/** An offset into a Call in milliseconds as minutes and seconds. */
export function formatOffset(milliseconds: number): string {
  return formatDuration(Math.floor(milliseconds / 1000))
}

/** The plain words for a Call's state. */
export const CALL_STATE_WORD: Record<string, string> = {
  ringing: 'Ringing',
  connecting: 'Connecting',
  disclosing: 'Disclosing',
  live: 'Live',
  ended: 'Ended',
  failed: 'Failed',
  missed: 'Missed',
}
