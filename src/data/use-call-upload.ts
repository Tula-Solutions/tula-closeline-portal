import { useCallback, useEffect, useRef, useState } from 'react'
import { SALES_HISTORY_ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { fingerprint } from '~/api/idempotency'
import { outcomeUnknown } from '~/api/manage-messages'
import type { CallUpload } from '~/api/sales-history'
import { presentSales } from '~/api/sales-messages'
import { useApp } from '~/app-context'
import { refresh } from '~/data/queries'

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
  const app = useApp()
  const [state, setState] = useState<CallUploadState>({ kind: 'idle' })
  const last = useRef<CallUpload | null>(null)
  const alive = useRef(true)
  const busy = useRef(false)
  const lastPercent = useRef(-1)
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

  const send = useCallback(
    async (upload: CallUpload): Promise<CallSendResult> => {
      if (busy.current) {
        return 'failed'
      }
      busy.current = true
      last.current = upload
      const name = upload.file.name
      lastPercent.current = -1
      setState({ kind: 'uploading', name, progress: null })
      const attempt = app.keys.begin(
        fingerprint.call(
          name,
          upload.file.size,
          upload.file.lastModified,
          upload.dealId,
          upload.rep === null ? '' : JSON.stringify(upload.rep)
        )
      )
      try {
        const result = await app.salesHistory.uploadCall(
          upload,
          attempt.key,
          controller.current?.signal,
          (sent, total) => {
            // The browser reports many times a second; the screen shows whole percents only.
            const percent = total === 0 ? 0 : Math.floor((sent / total) * 100)
            if (alive.current && percent !== lastPercent.current) {
              lastPercent.current = percent
              setState({ kind: 'uploading', name, progress: { sent, total } })
            }
          }
        )
        attempt.succeeded()
        last.current = null
        busy.current = false
        if (alive.current) {
          setState({ kind: result.duplicate ? 'duplicate' : 'stored', name })
        }
        try {
          await refresh(app, 'calls')
        } catch {
          // The Call is stored whatever happens to the list: a failed refresh is the list's own error.
        }
        return 'accepted'
      } catch (error) {
        attempt.failed(error)
        busy.current = false
        if (!alive.current) {
          return 'failed'
        }
        if (
          error instanceof ApiError &&
          error.code === SALES_HISTORY_ERRORS['rights.confirmation_required'].code
        ) {
          setState({ kind: 'idle' })
          return 'rights'
        }
        const retry = outcomeUnknown(error) || (error instanceof ApiError && error.status === 429)
        const wait = error instanceof ApiError ? error.retryAfterSeconds : undefined
        const waiting = retry && wait !== undefined
        if (!retry) {
          last.current = null
        }
        setState({
          kind: 'failed',
          name,
          message: presentSales(error, kind === 'recording' ? 'recording-upload' : 'call-upload')
            .message,
          retry,
          waiting,
        })
        if (waiting) {
          void app.sleep(wait * 1000).then(() => {
            if (alive.current) {
              setState((now) => (now.kind === 'failed' ? { ...now, waiting: false } : now))
            }
          })
        }
        return 'failed'
      }
    },
    [app, kind]
  )

  const retry = useCallback(() => {
    if (last.current === null || state.kind !== 'failed' || state.waiting) {
      return
    }
    void send(last.current)
  }, [send, state])

  const report = useCallback((name: string, message: string) => {
    last.current = null
    setState({ kind: 'failed', name, message, retry: false, waiting: false })
  }, [])

  return { state, send, retry, report }
}
