import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_PROSPECT_IMPORT_BYTES } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { fingerprint } from '~/api/idempotency'
import { outcomeUnknown } from '~/api/manage-messages'
import { presentProspect } from '~/api/prospect-messages'
import { useApp } from '~/app-context'
import { MAX_IMPORT_WORDS } from '~/data/prospect-imports'
import { refresh } from '~/data/queries'

/** Where the chosen CSV stands. */
export type ProspectImportUploadState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'uploading'; readonly name: string }
  | { readonly kind: 'stored'; readonly name: string; readonly importId: string }
  | {
      readonly kind: 'failed'
      readonly name: string
      readonly message: string
      /** The same upload may be sent again (with the same key if it may have arrived). */
      readonly retry: boolean
      /** A `Retry-After` wait is still running, so a retry is not offered yet. */
      readonly waiting: boolean
    }

/**
 * What is wrong with a chosen file before anything is sent, or null when it looks right. Only the
 * cheap checks are made here (extension, empty, size); the header and the rows are core's to judge.
 */
export function checkProspectImportFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return 'This is not a CSV. Upload a .csv file made from the template.'
  }
  if (file.size === 0) {
    return 'The file is empty. Upload a CSV with the header from the template and one row per Prospect.'
  }
  if (file.size > MAX_PROSPECT_IMPORT_BYTES) {
    return `This file is larger than ${MAX_IMPORT_WORDS}. Split it into smaller files.`
  }
  return null
}

/**
 * Sends one CSV at a time as a Prospect import. Its idempotency key lives in the app-level key
 * map, so a retry after an unknown outcome reuses it. `fetch` gives no upload progress, so a file
 * is "uploading" until core answers. The stored state carries the new import's id.
 */
export function useProspectImportUpload() {
  const app = useApp()
  const [state, setState] = useState<ProspectImportUploadState>({ kind: 'idle' })
  const file = useRef<File | null>(null)
  const alive = useRef(true)
  const busy = useRef(false)
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
    async (chosen: File) => {
      busy.current = true
      setState({ kind: 'uploading', name: chosen.name })
      const attempt = app.keys.begin(
        fingerprint.prospectImport(chosen.name, chosen.size, chosen.lastModified)
      )
      let stored: string
      try {
        const made = await app.core.uploadProspectImport(
          chosen,
          attempt.key,
          controller.current?.signal
        )
        attempt.succeeded()
        file.current = null
        stored = made.id
      } catch (error) {
        attempt.failed(error)
        busy.current = false
        if (!alive.current) {
          return
        }
        const retry = outcomeUnknown(error) || (error instanceof ApiError && error.status === 429)
        const wait = error instanceof ApiError ? error.retryAfterSeconds : undefined
        const waiting = retry && wait !== undefined
        if (!retry) {
          file.current = null
        }
        setState({
          kind: 'failed',
          name: chosen.name,
          message: presentProspect(error).message,
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
        return
      }
      busy.current = false
      if (alive.current) {
        setState({ kind: 'stored', name: chosen.name, importId: stored })
      }
      // The import is stored whatever happens to the list: a failed refresh is the list's own error.
      try {
        await refresh(app, 'prospectImports')
      } catch {
        // Nothing more to say about the upload.
      }
    },
    [app]
  )

  const choose = useCallback(
    async (chosen: File) => {
      if (busy.current) {
        return
      }
      const problem = checkProspectImportFile(chosen)
      if (problem !== null) {
        file.current = null
        setState({
          kind: 'failed',
          name: chosen.name,
          message: problem,
          retry: false,
          waiting: false,
        })
        return
      }
      file.current = chosen
      await send(chosen)
    },
    [send]
  )

  const retry = useCallback(() => {
    if (busy.current || file.current === null || state.kind !== 'failed' || state.waiting) {
      return
    }
    void send(file.current)
  }, [send, state])

  return { state, choose, retry }
}
