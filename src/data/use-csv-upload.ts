import { useCallback, useRef, useState } from 'react'
import { SALES_HISTORY_ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import type { refresh } from '~/data/queries'
import { useUploadRunner } from '~/data/use-upload'

/** Where the chosen CSV stands; `S` is what a stored upload adds (the new import's id, say). */
export type CsvUploadState<S extends object = object> =
  | { readonly kind: 'idle' }
  | { readonly kind: 'uploading'; readonly name: string }
  | ({ readonly kind: 'stored'; readonly name: string } & S)
  | {
      readonly kind: 'failed'
      readonly name: string
      readonly message: string
      /** The same upload may be sent again (with the same key if it may have arrived). */
      readonly retry: boolean
      /** A `Retry-After` wait is still running, so a retry is not offered yet. */
      readonly waiting: boolean
      /** The service wants the rights wording confirmed first: the screen links to it. */
      readonly rights: boolean
    }

/** What differs between the CSV uploads. */
export type CsvUploadConfig<S extends object> = {
  /** The idempotency fingerprint of one file. */
  readonly fingerprint: (file: File) => string
  /** Sends the file; resolves with what the stored state adds. */
  readonly upload: (file: File, key: string, signal: AbortSignal | undefined) => Promise<S>
  /** What is wrong with the file before anything is sent, or null. */
  readonly check: (file: File) => string | null | Promise<string | null>
  /** The words for a failed send. */
  readonly present: (error: unknown) => string
  /** The list to refetch once stored. */
  readonly list: Parameters<typeof refresh>[1]
}

/**
 * Sends one CSV at a time. The file is checked in the browser first; its idempotency key lives in
 * the app-level key map, so a retry after an unknown outcome reuses it. fetch gives no upload
 * progress, so a file is "uploading" until the service answers.
 */
export function useCsvUpload<S extends object>(config: CsvUploadConfig<S>) {
  const { isAlive, run, afterWait, refreshList } = useUploadRunner()
  const [state, setState] = useState<CsvUploadState<S>>({ kind: 'idle' })
  const file = useRef<File | null>(null)
  const busy = useRef(false)

  const send = useCallback(
    async (chosen: File) => {
      busy.current = true
      setState({ kind: 'uploading', name: chosen.name })
      const done = await run(config.fingerprint(chosen), (key, signal) =>
        config.upload(chosen, key, signal)
      )
      busy.current = false
      if (!done.ok) {
        if (!isAlive()) {
          return
        }
        if (!done.retry) {
          file.current = null
        }
        const waiting = done.waitSeconds !== undefined
        setState({
          kind: 'failed',
          name: chosen.name,
          message: config.present(done.error),
          retry: done.retry,
          waiting,
          rights:
            done.error instanceof ApiError &&
            done.error.code === SALES_HISTORY_ERRORS['rights.confirmation_required'].code,
        })
        if (done.waitSeconds !== undefined) {
          afterWait(done.waitSeconds, () =>
            setState((now) => (now.kind === 'failed' ? { ...now, waiting: false } : now))
          )
        }
        return
      }
      file.current = null
      if (isAlive()) {
        setState({ kind: 'stored', name: chosen.name, ...done.result })
      }
      await refreshList(config.list)
    },
    [isAlive, afterWait, config, refreshList, run]
  )

  const choose = useCallback(
    async (chosen: File) => {
      if (busy.current) {
        return
      }
      busy.current = true
      const problem = await config.check(chosen)
      busy.current = false
      if (!isAlive()) {
        return
      }
      if (problem !== null) {
        file.current = null
        setState({
          kind: 'failed',
          name: chosen.name,
          message: problem,
          retry: false,
          waiting: false,
          rights: false,
        })
        return
      }
      file.current = chosen
      await send(chosen)
    },
    [isAlive, config, send]
  )

  const retry = useCallback(() => {
    if (busy.current || file.current === null || state.kind !== 'failed' || state.waiting) {
      return
    }
    void send(file.current)
  }, [send, state])

  return { state, choose, retry }
}
