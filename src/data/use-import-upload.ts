import { useCallback, useEffect, useRef, useState } from 'react'
import {
  checkDealImportHeaderText,
  DEAL_IMPORT_HEADER_PREFIX_CHARS,
  MAX_DEAL_IMPORT_BYTES,
  MAX_UTF8_BYTES_PER_CODE_POINT,
  SALES_HISTORY_ERRORS,
} from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { fingerprint } from '~/api/idempotency'
import { outcomeUnknown } from '~/api/manage-messages'
import { presentSales } from '~/api/sales-messages'
import { useApp } from '~/app-context'
import { refresh } from '~/data/queries'
import { HEADER_PROBLEM_WORDS, MAX_IMPORT_WORDS } from '~/data/sales-history'

/** Where the chosen CSV stands. */
export type ImportUploadState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'uploading'; readonly name: string }
  | { readonly kind: 'stored'; readonly name: string }
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

/** What is wrong with a chosen file before anything is sent, or null when it looks right. */
export async function checkImportFile(file: File): Promise<string | null> {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return 'This is not a CSV. Upload a .csv file made from the template.'
  }
  if (file.size === 0) {
    return 'The file is empty. Upload a CSV with the header from the template and one row per Deal.'
  }
  if (file.size > MAX_DEAL_IMPORT_BYTES) {
    return `This file is larger than ${MAX_IMPORT_WORDS}. Split it into smaller files.`
  }
  // Read enough bytes to hold the prefix the service checks, then cut to the same characters.
  const bytes = DEAL_IMPORT_HEADER_PREFIX_CHARS * MAX_UTF8_BYTES_PER_CODE_POINT
  const text = (await file.slice(0, bytes).text()).slice(0, DEAL_IMPORT_HEADER_PREFIX_CHARS)
  const header = checkDealImportHeaderText(text)
  if (!header.ok) {
    return `The first row does not match the template. ${HEADER_PROBLEM_WORDS[header.problem]}`
  }
  return null
}

/**
 * Sends one CSV at a time as a Deal import. The file is checked in the browser first (extension,
 * size, header), with the same contract functions the service uses. Its idempotency key lives in the
 * app-level key map, so a retry after an unknown outcome reuses it. fetch gives no upload progress, so
 * a file is "uploading" until the service answers.
 */
export function useImportUpload() {
  const app = useApp()
  const [state, setState] = useState<ImportUploadState>({ kind: 'idle' })
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
        fingerprint.dealImport(chosen.name, chosen.size, chosen.lastModified)
      )
      try {
        await app.salesHistory.uploadDealImport(chosen, attempt.key, controller.current?.signal)
        attempt.succeeded()
        file.current = null
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
          message: presentSales(error, 'import-upload').message,
          retry,
          waiting,
          rights:
            error instanceof ApiError &&
            error.code === SALES_HISTORY_ERRORS['rights.confirmation_required'].code,
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
        setState({ kind: 'stored', name: chosen.name })
      }
      // The import is stored whatever happens to the list: a failed refresh is the list's own error.
      try {
        await refresh(app, 'dealImports')
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
      busy.current = true
      const problem = await checkImportFile(chosen)
      busy.current = false
      if (!alive.current) {
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
