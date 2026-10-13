import { useEffect, useState } from 'react'
import type { PlaybookDocument } from 'tula-closeline-contract'
import { useApp } from '~/app-context'
import { PENDING_STATES, POLL_SCHEDULE_MS } from '~/data/documents'

/**
 * Asks again about documents that are still `uploaded` or `processing`, after a wait that grows
 * (`POLL_SCHEDULE_MS`), and stops when nothing is pending, when the screen is left, when the
 * schedule runs out (`paused`; `resume` starts it again) and, while the tab is hidden, until it is
 * shown. A change in what is pending starts the schedule again from the shortest wait.
 */
export function usePendingPoll(
  documents: readonly PlaybookDocument[],
  refetch: () => Promise<unknown>
) {
  const app = useApp()
  const [paused, setPaused] = useState(false)
  const [round, setRound] = useState(0)
  const signature = documents
    .filter((document) => PENDING_STATES.includes(document.state))
    .map((document) => `${document.id}:${document.state}`)
    .join(',')
  // `refetch` is a new function each render; the loop below must keep calling the latest one.
  const [latest] = useState({ refetch })
  latest.refetch = refetch

  // biome-ignore lint/correctness/useExhaustiveDependencies: `round` only restarts the loop.
  useEffect(() => {
    if (signature === '') {
      return
    }
    setPaused(false)
    let stopped = false
    const cleanups: (() => void)[] = []
    const shown = () =>
      new Promise<void>((resolve) => {
        if (document.visibilityState !== 'hidden') {
          resolve()
          return
        }
        const onChange = () => {
          if (document.visibilityState !== 'hidden') {
            document.removeEventListener('visibilitychange', onChange)
            resolve()
          }
        }
        document.addEventListener('visibilitychange', onChange)
        cleanups.push(() => document.removeEventListener('visibilitychange', onChange))
      })
    void (async () => {
      for (const delay of POLL_SCHEDULE_MS) {
        await app.sleep(delay)
        if (stopped) {
          return
        }
        await shown()
        if (stopped) {
          return
        }
        await latest.refetch()
        if (stopped) {
          return
        }
      }
      setPaused(true)
    })()
    return () => {
      stopped = true
      for (const cleanup of cleanups) {
        cleanup()
      }
    }
  }, [signature, round, app, latest])

  return { paused, resume: () => setRound((value) => value + 1) }
}
