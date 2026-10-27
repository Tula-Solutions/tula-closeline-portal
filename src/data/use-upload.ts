import { useCallback, useEffect, useRef } from 'react'
import { ERRORS, SALES_HISTORY_ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { outcomeUnknown } from '~/api/manage-messages'
import { useApp } from '~/app-context'
import { refresh } from '~/data/queries'

/** The codes that say "busy, send it again" besides an unknown outcome: the rate limit and a full import queue. */
const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  ERRORS['rate.limited'].code,
  SALES_HISTORY_ERRORS['deal_import.busy'].code,
])

/** How one send ended: the answer, or the error with whether the same upload may be tried again. */
export type UploadRun<R> =
  | { readonly ok: true; readonly result: R }
  | {
      readonly ok: false
      readonly error: unknown
      /** The same upload may be sent again (with the same key if it may have arrived). */
      readonly retry: boolean
      /** Seconds of a `Retry-After` wait still to run before a retry is offered, when `retry`. */
      readonly waitSeconds: number | undefined
    }

/**
 * Shared by every upload hook: one idempotency attempt per send, an abort when the screen unmounts
 * (a new controller per mount, because StrictMode may mount twice and an aborted signal stays
 * aborted), the retry decision (by `area.reason`, never the status) and the `Retry-After` wait.
 */
export function useUploadRunner() {
  const app = useApp()
  const alive = useRef(true)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => {
    alive.current = true
    const abort = new AbortController()
    controller.current = abort
    return () => {
      alive.current = false
      abort.abort()
    }
  }, [])

  /** Sends once under the fingerprint's key; `upload` gets the key and the signal to pass on. */
  const run = useCallback(
    async <R>(
      fingerprint: string,
      upload: (key: string, signal: AbortSignal | undefined) => Promise<R>,
      signal?: AbortSignal
    ): Promise<UploadRun<R>> => {
      const attempt = app.keys.begin(fingerprint)
      try {
        const result = await upload(attempt.key, signal ?? controller.current?.signal)
        attempt.succeeded()
        return { ok: true, result }
      } catch (error) {
        attempt.failed(error)
        const retry =
          outcomeUnknown(error) || (error instanceof ApiError && RETRYABLE_CODES.has(error.code))
        const wait = error instanceof ApiError ? error.retryAfterSeconds : undefined
        return { ok: false, error, retry, waitSeconds: retry ? wait : undefined }
      }
    },
    [app]
  )

  /** Calls `done` after the `Retry-After` wait, unless the screen has gone. */
  const afterWait = useCallback(
    (seconds: number, done: () => void) => {
      void app.sleep(seconds * 1000).then(() => {
        if (alive.current) {
          done()
        }
      })
    },
    [app]
  )

  /** Refetches a list after a stored upload; a refresh that fails is the list's own error, not the upload's. */
  const refreshList = useCallback(
    async (list: Parameters<typeof refresh>[1]) => {
      try {
        await refresh(app, list)
      } catch {
        // Nothing more to say about the upload.
      }
    },
    [app]
  )

  /** True until the screen unmounts. */
  const isAlive = useCallback(() => alive.current, [])

  return { app, isAlive, run, afterWait, refreshList }
}
