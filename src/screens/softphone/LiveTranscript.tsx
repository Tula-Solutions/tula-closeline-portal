import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { COPILOT_ERRORS } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { useApp } from '~/app-context'
import { cn } from '~/lib/utils'
import { plain } from '~/ui/plain'

type Turn = {
  readonly sequence: number
  readonly speaker: 'rep' | 'prospect'
  readonly text: string
}
type State =
  | 'connecting'
  | 'waiting_for_disclosure'
  | 'live'
  | 'ended'
  | 'unavailable'
  | 'lost'
  | 'off'

const STATE_WORDS: Record<State, string> = {
  connecting: 'Connecting to the Transcript.',
  waiting_for_disclosure: 'Waiting for the Disclosure. The Transcript starts once it has played.',
  live: 'Live.',
  ended: 'The Call is over. This is what was said.',
  unavailable: 'Transcript unavailable. The Call is not affected.',
  lost: 'The Transcript connection was lost. The Call is not affected.',
  off: 'The Copilot is off for this Call.',
}

/** Most turns kept on screen; a longer Call drops its oldest (the Call's full Transcript is in Call history). */
const MAX_TURNS = 500
/** A stream that keeps failing is given up after this many tries in a row. */
const MAX_FAILURES = 6
const RESUME_MS = 1000
const BACKOFF_MAX_MS = 8000

/** The live Transcript of a Call the Rep placed with the Copilot on: scrolls to the newest turn, resumes after a dropped connection from the last event, and says in words what state it is in. */
export function LiveTranscript(props: { readonly callId: string }) {
  const app = useApp()
  const [turns, setTurns] = useState<readonly Turn[]>([])
  const [state, setState] = useState<State>('connecting')
  const list = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    const control = new AbortController()
    const { signal } = control
    let lastId: string | undefined
    let newest = 0
    let failures = 0
    let finished = false
    const run = async () => {
      while (!signal.aborted && !finished && failures < MAX_FAILURES) {
        try {
          await app.calls.stream(
            props.callId,
            lastId,
            (message) => {
              failures = 0
              lastId = message.id
              if (message.event === 'copilot.status') {
                finished = message.data.state === 'ended'
                const next =
                  message.data.quietReason === 'transcript_unavailable'
                    ? 'unavailable'
                    : message.data.state
                // Once unavailable it stays so: the Call ending does not make the words come back.
                setState((now) => (now === 'unavailable' ? now : next))
              } else if (message.event === 'transcript.unavailable') {
                setState('unavailable')
              } else if (message.event === 'transcript.turn' && message.data.sequence > newest) {
                newest = message.data.sequence
                const { speaker, text } = message.data.turn
                setTurns((now) => [...now, { sequence: newest, speaker, text }].slice(-MAX_TURNS))
              }
            },
            signal
          )
        } catch (caught) {
          if (signal.aborted) {
            return
          }
          if (
            caught instanceof ApiError &&
            caught.code === COPILOT_ERRORS['copilot.disabled'].code
          ) {
            setState('off')
            return
          }
          failures += 1
        }
        if (!finished && failures < MAX_FAILURES) {
          const wait = Math.min(BACKOFF_MAX_MS, RESUME_MS * 2 ** failures)
          await app.sleep(wait * (0.5 + Math.random() / 2))
        }
      }
      if (!signal.aborted && !finished) {
        setState('lost')
      }
    }
    void run()
    return () => control.abort()
  }, [app, props.callId])

  // Follow the newest turn unless the Rep has scrolled up to read.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when a turn arrives
  useLayoutEffect(() => {
    const box = list.current
    if (box !== null && stick.current) {
      box.scrollTop = box.scrollHeight
    }
  }, [turns])

  return (
    <section aria-label='Live Transcript' className='lg:col-span-2 border-t pt-4'>
      <div className='flex flex-wrap items-baseline gap-x-6'>
        <h3 className='label-mono'>Live Transcript</h3>
        <p aria-live='polite' className='text-sm'>
          {STATE_WORDS[state]}
        </p>
      </div>
      <div
        ref={list}
        role='log'
        aria-label='Transcript turns'
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable log must be reachable by keyboard
        tabIndex={0}
        className='mt-3 max-h-56 overflow-y-auto'
        onScroll={(event) => {
          const box = event.currentTarget
          stick.current = box.scrollHeight - box.scrollTop - box.clientHeight < 40
        }}
      >
        {turns.length === 0 ? (
          <p className='text-sm text-muted-foreground'>No turns yet.</p>
        ) : (
          <ol className='grid gap-3'>
            {turns.map((turn) => (
              <li
                key={turn.sequence}
                className={cn(
                  'grid grid-cols-[5.5rem_1fr] gap-x-3 border-l-2 pl-3',
                  turn.speaker === 'rep' ? 'border-foreground' : 'border-rule-strong'
                )}
              >
                <span className='label-mono'>{turn.speaker === 'rep' ? 'You' : 'Prospect'}</span>
                <span className='text-sm wrap-anywhere'>{plain(turn.text)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
