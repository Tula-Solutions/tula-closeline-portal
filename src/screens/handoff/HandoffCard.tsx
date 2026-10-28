import { useEffect, useState } from 'react'
import { AGENT_ERRORS, type Handoff, type HandoffContext } from 'tula-closeline-contract'
import { ApiError } from '~/api/errors'
import { presentHandoff } from '~/api/voice-messages'
import { useApp } from '~/app-context'
import { Button } from '~/components/ui/button'
import { prospectName } from '~/data/prospects'
import { useProspect } from '~/data/queries'
import { plain } from '~/ui/plain'
import { Untrusted } from '~/ui/Untrusted'

/** A pending Handoff is looked for this often; the offer runs out after the ring timeout, so a slower read would miss it. */
const POLL_MS = 3000

const REASON_WORDS: Record<Handoff['reason'], string> = {
  asked_for_rep: 'The Prospect asked for a person.',
  qualified: 'The Prospect is qualified and ready for a person.',
  agent_unsure: 'The Agent could not answer and handed over.',
  prospect_frustrated: 'The Prospect sounded frustrated.',
}

type Loaded =
  | { readonly id: string; readonly context: HandoffContext }
  | { readonly id: string; readonly failed: string }

/** The Rep's incoming Handoff, docked at the top of every page: why the Agent handed over, the Prospect, the Qualification so far and the Transcript so far, with Accept and Decline. */
export function HandoffCard(props: { readonly pollMs?: number }) {
  const pollMs = props.pollMs ?? POLL_MS
  const app = useApp()
  const [offers, setOffers] = useState<readonly Handoff[]>([])
  const [done, setDone] = useState<readonly string[]>([])
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ readonly text: string; readonly error: boolean } | null>(
    null
  )
  const offer = offers.find((item) => !done.includes(item.id))
  const offerId = offer?.id ?? null

  // Look for Handoffs offered to this Rep, except while one is being answered.
  useEffect(() => {
    if (busy) {
      return undefined
    }
    const control = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      let next = pollMs
      try {
        setOffers(await app.voice.listPendingHandoffs(control.signal))
      } catch {
        next = pollMs * 2 // shortcut: a failed read says nothing and retries soon; the card shows only what it knows
      }
      if (!control.signal.aborted) {
        timer = setTimeout(tick, next)
      }
    }
    timer = setTimeout(tick, pollMs)
    return () => {
      control.abort()
      clearTimeout(timer)
    }
  }, [app, busy, pollMs])

  // A new offer replaces the last answer's message.
  useEffect(() => {
    if (offerId !== null) {
      setMessage(null)
    }
  }, [offerId])

  // The context is read once per offer.
  useEffect(() => {
    if (offerId === null) {
      return undefined
    }
    const control = new AbortController()
    app.voice.getHandoffContext(offerId, control.signal).then(
      (context) => setLoaded({ id: offerId, context }),
      (caught) => {
        if (control.signal.aborted) {
          return
        }
        if (caught instanceof ApiError && caught.code === AGENT_ERRORS['handoff.not_found'].code) {
          setDone((now) => [...now, offerId]) // gone before the Rep saw it: drop it quietly
        } else {
          setLoaded({ id: offerId, failed: presentHandoff(caught).message })
        }
      }
    )
    return () => control.abort()
  }, [app, offerId])

  const context =
    loaded?.id === offerId && loaded !== null && 'context' in loaded ? loaded.context : null
  const prospect = useProspect(context?.prospectId ?? '')

  const named = prospect.data ? prospectName(prospect.data) : null
  const caller = named === null || named === 'Unnamed Prospect' ? null : named

  async function answer(handoff: Handoff, verb: 'accept' | 'decline') {
    setBusy(true)
    setMessage(null)
    try {
      await app.voice.answerHandoff(handoff.id, verb)
      setDone((now) => [...now, handoff.id])
      setMessage({
        text:
          verb === 'accept'
            ? 'Accepted. The Disclosure plays to the Prospect, then you are connected. Answer in the Softphone.'
            : 'Declined. It goes to the next Rep.',
        error: false,
      })
    } catch (caught) {
      // Only these two codes mean the offer is gone; any other failure leaves it to retry.
      if (
        caught instanceof ApiError &&
        (caught.code === AGENT_ERRORS['handoff.not_found'].code ||
          caught.code === AGENT_ERRORS['handoff.not_pending'].code)
      ) {
        setDone((now) => [...now, handoff.id])
      }
      setMessage({ text: presentHandoff(caught).message, error: true })
    } finally {
      setBusy(false)
    }
  }

  if (offer === undefined && message === null) {
    return null
  }
  const answered = context?.qualification.answers.filter((item) => !item.skipped).length ?? 0
  return (
    <section
      aria-label='Incoming Handoff'
      className='fixed inset-x-0 top-0 z-30 max-h-[80dvh] overflow-y-auto border-b-2 border-rule-strong bg-background md:left-60'
    >
      <div className='px-4 py-4 md:px-12 xl:px-16'>
        <div className='flex flex-wrap items-center gap-x-6 gap-y-2'>
          <h2 className='label-mono'>Incoming Handoff</h2>
          <p
            aria-live='polite'
            className={`min-w-0 flex-1 text-sm ${message?.error ? 'font-medium text-destructive' : ''}`}
          >
            {message?.text ?? (offer ? REASON_WORDS[offer.reason] : '')}
          </p>
          {offer !== undefined && message === null ? (
            <>
              <Button size='sm' disabled={busy} onClick={() => answer(offer, 'accept')}>
                Accept
              </Button>
              <Button
                size='sm'
                variant='outline'
                disabled={busy}
                onClick={() => answer(offer, 'decline')}
              >
                Decline
              </Button>
            </>
          ) : (
            <Button size='sm' variant='link' onClick={() => setMessage(null)}>
              Close
            </Button>
          )}
        </div>
        {offer !== undefined && message === null ? (
          <div className='mt-4 grid gap-6 border-t pt-4 lg:grid-cols-[18rem_1fr]'>
            {loaded?.id === offer.id && 'failed' in loaded ? (
              <p role='alert' className='text-sm text-destructive'>
                {loaded.failed}
              </p>
            ) : context === null ? (
              <p className='text-sm'>Loading the context...</p>
            ) : (
              <>
                <dl className='grid grid-cols-[auto_1fr] content-start gap-x-6 gap-y-1 text-sm'>
                  <dt className='label-mono'>Prospect</dt>
                  <dd>
                    {caller === null ? (
                      prospect.isPending ? (
                        'Loading...'
                      ) : (
                        'Unknown caller'
                      )
                    ) : (
                      <Untrusted value={caller} />
                    )}
                  </dd>
                  <dt className='label-mono'>Qualified</dt>
                  <dd>
                    {answered} of {context.qualification.answers.length} questions answered
                  </dd>
                  <dt className='label-mono'>Summary</dt>
                  <dd>
                    {context.qualification.summary === null
                      ? 'None yet.'
                      : plain(context.qualification.summary)}
                  </dd>
                </dl>
                <div>
                  <p className='label-mono'>Transcript so far</p>
                  <ol aria-label='Transcript so far' className='mt-1 grid gap-1 text-sm'>
                    {context.recentTurns.map((turn) => (
                      <li key={turn.index}>
                        <span className='label-mono mr-2'>
                          {turn.role === 'agent' ? 'Agent' : 'Prospect'}
                        </span>
                        {plain(turn.text)}
                      </li>
                    ))}
                  </ol>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}
