import { useEffect, useRef, useState } from 'react'
import type { CreateEnrichmentRequest, EnrichmentRunSet } from 'tula-closeline-contract'
import { presentEnrichment } from '~/api/enrichment-messages'
import { fingerprint } from '~/api/idempotency'
import { useApp } from '~/app-context'
import { refreshEnrichment } from '~/data/enrichment-queries'
import { useSubmit } from '~/ui/useSubmit'

/** How long to wait between looks at a running request, and how many looks to make (about five minutes). */
type EnrichIds = CreateEnrichmentRequest['prospectIds']
const POLL_MS = 2000
const MAX_POLLS = 150

/**
 * Starts an enrichment for some Prospects and follows it to its end: the request is sent with an
 * idempotency key, its progress is read until every run has ended, and the enrichment reads are
 * refreshed so new data shows without a reload.
 */
export function useEnrich(handlers: { readonly onFail: () => void }) {
  const app = useApp()
  const [progress, setProgress] = useState<EnrichmentRunSet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const run = useSubmit<EnrichIds>(
    async (ids) => {
      const attempt = app.keys.begin(fingerprint.enrichment(JSON.stringify(ids)))
      let set: EnrichmentRunSet
      try {
        set = await app.outbound.createEnrichment({ prospectIds: [...ids] }, attempt.key)
      } catch (failure) {
        attempt.failed(failure)
        throw failure
      }
      attempt.succeeded()
      setProgress(set)
      for (let polls = 0; !set.done && polls < MAX_POLLS && alive.current; polls++) {
        await app.sleep(POLL_MS)
        set = await app.outbound.getRunSet(set.id)
        setProgress(set)
      }
      if (!set.done && alive.current) {
        setError('This is still running. Check back shortly.')
      }
      await refreshEnrichment(app)
    },
    {
      onError(failure) {
        handlers.onFail()
        setError(presentEnrichment(failure).message)
      },
    }
  )
  return {
    progress,
    error,
    pending: run.pending,
    start(ids: EnrichIds) {
      setError(null)
      setProgress(null)
      run.submit(ids)
    },
  }
}

/** The words for how far a request has got, for a status line. */
export function progressText(set: EnrichmentRunSet): string {
  const ended = set.counts.complete + set.counts.incomplete + set.counts.stopped
  const noun = set.total === 1 ? 'Prospect' : 'Prospects'
  if (set.done) {
    return set.counts.stopped > 0
      ? `Enrichment ended: ${ended} of ${set.total} ${noun} done, ${set.counts.stopped} stopped because the budget ran out.`
      : `Enrichment done for ${set.total} ${noun}.`
  }
  return `Enriching: ${ended} of ${set.total} ${noun} done...`
}

/** A progress bar and a status line for a request; nothing before one starts. */
export function EnrichProgress(props: {
  readonly progress: EnrichmentRunSet | null
  readonly error: string | null
}) {
  const { progress, error } = props
  return (
    <div>
      {error ? (
        <p className='field-error' role='alert'>
          <strong>Error:</strong> {error}
        </p>
      ) : null}
      <p role='status' className='notice'>
        {progress ? progressText(progress) : ''}
      </p>
      {progress && !progress.done ? (
        <progress
          className='h-1 w-full'
          aria-label='Enrichment progress'
          max={progress.total}
          value={progress.counts.complete + progress.counts.incomplete + progress.counts.stopped}
        />
      ) : null}
    </div>
  )
}
