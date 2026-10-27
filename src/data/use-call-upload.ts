import { useCallback, useEffect, useRef, useState } from 'react'
import { SALES_HISTORY_ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { fingerprint } from '~/api/idempotency'
import type { CallUpload } from '~/api/sales-history'
import { presentSales } from '~/api/sales-messages'
import { useUploadRunner } from '~/data/use-upload'

/** Where the Transcript being sent stands. */
export type CallUploadState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'uploading'
      readonly name: string
      /** Bytes sent and the total, once the browser has reported any; null before that. */
      readonly progress: { readonly sent: number; readonly total: number } | null
    }
  | { readonly kind: 'stored'; readonly name: string }
  /** The person cancelled the upload; the service usually did not get the whole file, but one that had just arrived may still be stored. */
  | { readonly kind: 'cancelled'; readonly name: string }
  /** The service already had this content for this Deal (HTTP 200), so nothing new was stored. */
  | { readonly kind: 'duplicate'; readonly name: string }
  | {
      readonly kind: 'failed'
      readonly name: string
      readonly message: string
      readonly retry: boolean
      readonly waiting: boolean
    }

/** How a send ended, for the form: `rights` means the service wants the wording confirmed first. */
export type CallSendResult = 'accepted' | 'failed' | 'rights'

/**
 * Sends one Transcript or Recording at a time. Its idempotency key lives in the app-level key map,
 * so a retry after an unknown outcome reuses it. A Recording reports upload progress as the
 * browser sends it. Nothing about the deal id is kept here beyond the call. `kind` picks the words
 * of the errors (the size limit differs).
 */
export function useCallUpload(kind: 'transcript' | 'recording' = 'transcript') {
  const { app, isAlive, run, afterWait, refreshList } = useUploadRunner()
  const [state, setState] = useState<CallUploadState>({ kind: 'idle' })
  const last = useRef<CallUpload | null>(null)
  const busy = useRef(false)
  const lastPercent = useRef(-1)
  // The request in flight: leaving the screen and Cancel both abort it.
  const sending = useRef<AbortController | null>(null)
  const cancelled = useRef(false)

  useEffect(() => () => sending.current?.abort(), [])

  const send = useCallback(
    async (upload: CallUpload): Promise<CallSendResult> => {
      if (busy.current) {
        return 'failed'
      }
      busy.current = true
      last.current = upload
      const name = upload.file.name
      lastPercent.current = -1
      cancelled.current = false
      const own = new AbortController()
      sending.current = own
      setState({ kind: 'uploading', name, progress: null })
      const done = await run(
        fingerprint.call(
          name,
          upload.file.size,
          upload.file.lastModified,
          upload.dealId,
          upload.rep === null ? '' : JSON.stringify(upload.rep)
        ),
        (key, signal) =>
          app.salesHistory.uploadCall(upload, key, signal, (sent, total) => {
            // The browser reports many times a second; the screen shows whole percents only.
            const percent = total === 0 ? 0 : Math.floor((sent / total) * 100)
            if (isAlive() && percent !== lastPercent.current) {
              lastPercent.current = percent
              setState({ kind: 'uploading', name, progress: { sent, total } })
            }
          }),
        own.signal
      )
      busy.current = false
      if (done.ok) {
        last.current = null
        if (isAlive()) {
          setState({ kind: done.result.duplicate ? 'duplicate' : 'stored', name })
        }
        await refreshList('calls')
        return 'accepted'
      }
      if (!isAlive()) {
        return 'failed'
      }
      if (cancelled.current) {
        last.current = null
        setState({ kind: 'cancelled', name })
        return 'failed'
      }
      if (
        done.error instanceof ApiError &&
        done.error.code === SALES_HISTORY_ERRORS['rights.confirmation_required'].code
      ) {
        setState({ kind: 'idle' })
        return 'rights'
      }
      if (!done.retry) {
        last.current = null
      }
      setState({
        kind: 'failed',
        name,
        message: presentSales(done.error, kind === 'recording' ? 'recording-upload' : 'call-upload')
          .message,
        retry: done.retry,
        waiting: done.waitSeconds !== undefined,
      })
      if (done.waitSeconds !== undefined) {
        afterWait(done.waitSeconds, () =>
          setState((now) => (now.kind === 'failed' ? { ...now, waiting: false } : now))
        )
      }
      return 'failed'
    },
    [afterWait, isAlive, app, kind, refreshList, run]
  )

  const retry = useCallback(() => {
    if (last.current === null || state.kind !== 'failed' || state.waiting) {
      return
    }
    void send(last.current)
  }, [send, state])

  const cancel = useCallback(() => {
    cancelled.current = true
    sending.current?.abort()
  }, [])

  const clear = useCallback(() => {
    // A finished result goes when a new action starts; an upload still in flight is left alone.
    setState((now) => (now.kind === 'uploading' ? now : { kind: 'idle' }))
  }, [])

  const report = useCallback((name: string, message: string) => {
    last.current = null
    setState({ kind: 'failed', name, message, retry: false, waiting: false })
  }, [])

  return { state, send, retry, cancel, clear, report }
}
