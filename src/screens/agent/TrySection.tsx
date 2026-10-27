import { type FormEvent, useRef, useState } from 'react'
import {
  AGENT_ERRORS,
  type AgentTurn,
  MAX_TURN_TEXT_LENGTH,
  type TrySession,
} from 'tula-closeline-contract'
import { presentAgent } from '~/api/agent-messages'
import { ApiError } from '~/api/errors'
import { fingerprint } from '~/api/idempotency'
import { useApp } from '~/app-context'
import { Section } from '~/components/app/section'
import { useAgentPause, useDocumentsFirstPage } from '~/data/queries'
import { TOOL_WORD } from '~/screens/agent/words'
import { Banner } from '~/ui/Banner'
import { plain } from '~/ui/plain'
import { TextAreaField } from '~/ui/TextAreaField'

/** One line of the transcript: what the Admin said, or the Agent's turn with its marginal notes. */
type Line =
  | { readonly kind: 'said'; readonly text: string }
  | { readonly kind: 'turn'; readonly turn: AgentTurn }

/** A rehearsal of the Inbound Agent in text: the transcript on the left, the sources and tool calls behind each answer in the margin. */
export function TrySection(props: { readonly manage: boolean }) {
  const app = useApp()
  const pause = useAgentPause(props.manage)
  const [session, setSession] = useState<TrySession | undefined>()
  const [lines, setLines] = useState<readonly Line[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<'starting' | 'thinking' | undefined>()
  const [failure, setFailure] = useState<unknown>()
  const [failedText, setFailedText] = useState<string | undefined>()
  const [pausedByError, setPausedByError] = useState(false)
  const starts = useRef(0)
  const sent = useRef(0)

  if (!props.manage) {
    return (
      <Section id='try' title='Try your Agent'>
        <p role='status' className='notice'>
          Only an Owner or Admin can try the Agent.
        </p>
      </Section>
    )
  }

  const paused = pause.data?.paused === true || (pausedByError && pause.data?.paused !== false)

  const fail = (error: unknown) => {
    if (error instanceof ApiError && error.code === AGENT_ERRORS['agent.paused'].code) {
      setPausedByError(true)
    }
    if (error instanceof ApiError && error.code === AGENT_ERRORS['agent.session_not_found'].code) {
      setSession(undefined)
    }
    setFailure(error)
  }

  const start = async () => {
    if (busy !== undefined) {
      return
    }
    setBusy('starting')
    setFailure(undefined)
    starts.current += 1
    const attempt = app.keys.begin(fingerprint.trySession(starts.current))
    try {
      const started = await app.voice.startTrySession(attempt.key)
      attempt.succeeded()
      setSession(started)
      setLines([{ kind: 'turn', turn: started.opening }])
      setPausedByError(false)
    } catch (error) {
      attempt.failed(error)
      starts.current -= 1
      fail(error)
    } finally {
      setBusy(undefined)
    }
  }

  const submit = async (message: string) => {
    if (session === undefined || busy !== undefined || paused || message === '') {
      return
    }
    setBusy('thinking')
    setFailure(undefined)
    setFailedText(undefined)
    const attempt = app.keys.begin(fingerprint.tryMessage(session.id, sent.current, message))
    try {
      const reply = await app.voice.sendTryMessage(session.id, message, attempt.key)
      attempt.succeeded()
      sent.current += 1
      setLines((current) => [
        ...current,
        { kind: 'said', text: message },
        { kind: 'turn', turn: reply },
      ])
      setText('')
    } catch (error) {
      attempt.failed(error)
      setFailedText(message)
      fail(error)
    } finally {
      setBusy(undefined)
    }
  }

  const send = (event: FormEvent) => {
    event.preventDefault()
    void submit(text.trim())
  }

  const startOver = () => {
    setSession(undefined)
    setLines([])
    setText('')
    setFailure(undefined)
    setFailedText(undefined)
    sent.current = 0
  }

  return (
    <Section
      id='try'
      title='Try your Agent'
      description='Talk to the Inbound Agent in text, on the live instructions and Playbook. No call is placed and nothing is sent. Beside each answer are the Documents and tools behind it. This conversation is not kept: leave the page or start over and it is gone.'
      actions={
        session === undefined ? null : (
          <button
            type='button'
            className='button'
            aria-disabled={busy !== undefined}
            onClick={() => {
              if (busy === undefined) {
                startOver()
              }
            }}
          >
            Start over
          </button>
        )
      }
    >
      {paused ? (
        <p role='status' className='notice'>
          The Agents are paused, so the Agent will not answer. Resume them above to try it.
        </p>
      ) : null}
      {failure === undefined ? null : (
        <div role='alert'>
          <Banner kind='error'>{presentAgent(failure).message}</Banner>
          {session === undefined ? (
            <button type='button' className='button' onClick={() => void start()}>
              Try again
            </button>
          ) : failedText === undefined || paused ? null : (
            <button type='button' className='button' onClick={() => void submit(failedText)}>
              Try again
            </button>
          )}
        </div>
      )}
      {session === undefined ? (
        <div className='border-y py-3'>
          <p className='m-0 mb-3'>No conversation yet. Start one to see how the Agent answers.</p>
          <button
            type='button'
            className='button'
            aria-disabled={busy === 'starting' || paused}
            onClick={() => {
              if (!paused) {
                void start()
              }
            }}
          >
            {busy === 'starting' ? 'Starting...' : 'Start a conversation'}
          </button>
        </div>
      ) : (
        <>
          <ol className='m-0 list-none border-t p-0' aria-label='Conversation with the Agent'>
            {lines.map((line, position) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: an append-only transcript
                key={position}
                className='grid gap-x-8 gap-y-2 border-b py-4 md:grid-cols-[minmax(0,1fr)_17rem]'
              >
                {line.kind === 'said' ? (
                  <div>
                    <p className='m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                      You
                    </p>
                    <p className='m-0 mt-1 whitespace-pre-wrap break-words'>{plain(line.text)}</p>
                  </div>
                ) : (
                  <Answer turn={line.turn} />
                )}
              </li>
            ))}
          </ol>
          {busy === 'thinking' ? (
            <p role='status' className='notice'>
              The Agent is thinking...
            </p>
          ) : null}
          <form onSubmit={send} className='mt-4'>
            <TextAreaField
              label='Say something to the Agent'
              value={text}
              maxLength={MAX_TURN_TEXT_LENGTH}
              onChange={(event) => setText(event.target.value)}
            />
            <button
              type='submit'
              className='button'
              aria-disabled={busy !== undefined || paused || text.trim() === ''}
            >
              {busy === 'thinking' ? 'Sending...' : 'Send'}
            </button>
          </form>
        </>
      )}
    </Section>
  )
}

function Answer(props: { readonly turn: AgentTurn }) {
  const { turn } = props
  const noted = turn.deferred || turn.sources.length > 0 || turn.toolCall !== null
  return (
    <>
      <div>
        <p className='m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
          Agent
        </p>
        <p className='m-0 mt-1 whitespace-pre-wrap break-words'>{plain(turn.text)}</p>
      </div>
      {noted ? (
        <aside
          aria-label='Behind this answer'
          className='border-t pt-2 text-sm md:border-t-0 md:border-l md:pt-0 md:pl-4'
        >
          {turn.deferred ? (
            <p className='m-0 mb-2'>
              <strong>Deferred.</strong> The Agent did not know the answer, so it said someone would
              follow up.
            </p>
          ) : null}
          {turn.sources.length > 0 ? <Sources sources={turn.sources} /> : null}
          {turn.toolCall === null ? null : (
            <p className='m-0'>
              <strong>Tool.</strong> {TOOL_WORD[turn.toolCall.name]}
            </p>
          )}
        </aside>
      ) : (
        <p className='m-0 text-sm text-muted-foreground md:border-l md:pl-4'>No source used.</p>
      )}
    </>
  )
}

function Sources(props: { readonly sources: AgentTurn['sources'] }) {
  const documents = useDocumentsFirstPage()
  const name = (id: string) =>
    plain(documents.items.find((item) => item.id === id)?.fileName ?? '', 'A Document')
  return (
    <>
      <p className='m-0 font-semibold'>Sources</p>
      <ul className='m-0 mb-2 list-none divide-y p-0'>
        {props.sources.map((source) => (
          <li
            key={`${source.documentId}-${source.page ?? 'x'}-${source.passage}`}
            className='py-1.5'
          >
            <span>
              {name(source.documentId)}
              {source.page === null ? '' : `, page ${source.page}`}
            </span>
            <q className='block text-muted-foreground'>{plain(source.passage)}</q>
          </li>
        ))}
      </ul>
    </>
  )
}
