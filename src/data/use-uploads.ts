import { useCallback, useRef, useState } from 'react'
import { checkUploadFile } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { fingerprint } from '~/api/idempotency'
import { presentDocument } from '~/api/playbook-messages'
import { useUploadRunner } from '~/data/use-upload'

/** Where one chosen file stands. */
export type UploadOutcome =
  | { readonly kind: 'queued' }
  | { readonly kind: 'uploading' }
  | { readonly kind: 'stored'; readonly storedName: string }
  /** The service already had this content (HTTP 200): `storedName` is the name it kept, not this file's. */
  | { readonly kind: 'duplicate'; readonly storedName: string }
  | {
      readonly kind: 'failed'
      readonly message: string
      /** The same upload may be tried again (and, if it may have arrived, with the same key). */
      readonly retry: boolean
      /** A `Retry-After` wait is still running, so a retry is not offered yet. */
      readonly waiting: boolean
    }

/** One chosen file and its outcome. */
export type UploadEntry = {
  readonly id: number
  readonly name: string
  readonly outcome: UploadOutcome
}

/**
 * Uploads chosen files one at a time. Each file is checked with the contract's `checkUploadFile`
 * before anything is sent. A file's idempotency key lives in the app-level key map, so it survives
 * leaving the screen after an unknown outcome and is dropped after a definite refusal. fetch gives
 * no upload progress, so a file is "uploading" until the service answers.
 */
export function useUploads() {
  const { app, isAlive, run, afterWait, refreshList } = useUploadRunner()
  const [entries, setEntries] = useState<readonly UploadEntry[]>([])
  const latest = useRef<readonly UploadEntry[]>([])
  const files = useRef(new Map<number, File>())
  const nextId = useRef(1)
  const running = useRef(false)

  const change = useCallback(
    (update: (current: readonly UploadEntry[]) => readonly UploadEntry[]) => {
      latest.current = update(latest.current)
      setEntries(latest.current)
    },
    []
  )
  const setOutcome = useCallback(
    (id: number, outcome: UploadOutcome) =>
      change((current) =>
        current.map((entry) => (entry.id === id ? { ...entry, outcome } : entry))
      ),
    [change]
  )

  const send = useCallback(
    async (id: number, file: File) => {
      setOutcome(id, { kind: 'uploading' })
      const done = await run(
        fingerprint.document(file.name, file.size, file.lastModified),
        (key, signal) => app.playbook.uploadDocument(file, key, signal)
      )
      if (!done.ok) {
        if (!isAlive()) {
          return
        }
        const waiting = done.waitSeconds !== undefined
        if (!done.retry) {
          files.current.delete(id)
        }
        setOutcome(id, {
          kind: 'failed',
          message: presentDocument(done.error, 'upload').message,
          retry: done.retry,
          waiting,
        })
        if (done.waitSeconds !== undefined) {
          afterWait(done.waitSeconds, () => {
            const entry = latest.current.find((candidate) => candidate.id === id)
            if (entry?.outcome.kind === 'failed') {
              setOutcome(id, { ...entry.outcome, waiting: false })
            }
          })
        }
        return
      }
      files.current.delete(id)
      if (isAlive()) {
        setOutcome(id, {
          kind: done.result.duplicate ? 'duplicate' : 'stored',
          storedName: done.result.document.fileName,
        })
      }
      await refreshList('documents')
    },
    [app, afterWait, isAlive, refreshList, run, setOutcome]
  )

  const pump = useCallback(async () => {
    if (running.current) {
      return
    }
    running.current = true
    try {
      for (;;) {
        const next = latest.current.find((entry) => entry.outcome.kind === 'queued')
        const file = next === undefined ? undefined : files.current.get(next.id)
        if (next === undefined || !isAlive()) {
          return
        }
        if (file === undefined) {
          change((current) => current.filter((entry) => entry.id !== next.id))
          continue
        }
        await send(next.id, file)
      }
    } finally {
      running.current = false
    }
  }, [change, send, isAlive])

  const add = useCallback(
    (chosen: readonly File[]) => {
      const added: UploadEntry[] = chosen.map((file) => {
        const id = nextId.current++
        const checked = checkUploadFile({
          fileName: file.name,
          declaredMediaType: file.type === '' ? null : file.type,
          sizeBytes: file.size,
        })
        if (checked.ok) {
          files.current.set(id, file)
          return { id, name: file.name, outcome: { kind: 'queued' } }
        }
        const status =
          checked.code === 'document.too_large'
            ? 413
            : checked.code === 'document.unsupported_type'
              ? 415
              : 400
        return {
          id,
          name: file.name,
          outcome: {
            kind: 'failed',
            message: presentDocument(new ApiError({ code: checked.code, status }), 'upload')
              .message,
            retry: false,
            waiting: false,
          },
        }
      })
      change((current) => [...current, ...added])
      void pump()
    },
    [change, pump]
  )

  const retry = useCallback(
    (id: number) => {
      const entry = latest.current.find((candidate) => candidate.id === id)
      if (entry?.outcome.kind !== 'failed' || !entry.outcome.retry || entry.outcome.waiting) {
        return
      }
      setOutcome(id, { kind: 'queued' })
      void pump()
    },
    [pump, setOutcome]
  )

  const dismiss = useCallback(
    (id: number) => {
      files.current.delete(id)
      change((current) => current.filter((entry) => entry.id !== id))
    },
    [change]
  )

  return { entries, add, retry, dismiss }
}
