import { useRouter } from '@tanstack/react-router'
import type { CountryCode } from 'libphonenumber-js/min'
import { useCallback, useEffect, useRef, useState } from 'react'
import { VOICE_ERRORS } from 'tula-closeline-contract'
import type { SoftphoneCall } from '~/api/calls'
import { ApiError } from '~/api/errors'
import { fingerprint } from '~/api/idempotency'
import { presentCall } from '~/api/voice-messages'
import { useApp } from '~/app-context'
import { Button } from '~/components/ui/button'
import { Select } from '~/components/ui/select'
import { cn } from '~/lib/utils'
import { Untrusted } from '~/ui/Untrusted'
import { buildE164, COUNTRY_OPTIONS, DEFAULT_COUNTRY, splitInternational } from './countries'
import type { VoiceConnector, VoiceLeg } from './voice-device'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'] as const
const TERMINAL = ['ended', 'failed', 'missed']
/** Ringing Calls and the Call in hand are read this often; the Voice SDK carries audio only, so state still comes from here. */
const POLL_MS = 3000
/** Longest national number the field takes (E.164 is 15 digits in all, with room for spaces). */
const MAX_NUMBER = 24

type Mic = 'idle' | 'checking' | 'ready' | 'denied' | 'unavailable'

const MIC_WORDS: Record<Mic, string> = {
  idle: 'Microphone not checked yet.',
  checking: 'Waiting for the browser to ask about the microphone.',
  ready: 'Microphone ready.',
  denied:
    'The browser blocked the microphone, so you cannot take or place Calls. Allow it for this site in the browser settings, then retry.',
  unavailable: 'No microphone was found. Connect one, then retry.',
}

/** What the Disclosure is doing, from the Call: playing until it has played, then the wording version. */
function disclosureWords(call: SoftphoneCall): string {
  const { wordingVersion, playedAt } = call.disclosure
  if (playedAt !== null && wordingVersion !== null) {
    return `Disclosure played, v${wordingVersion}`
  }
  if (call.state === 'failed') {
    return 'Disclosure not played'
  }
  return 'Disclosure playing'
}

const STATE_WORDS: Record<SoftphoneCall['state'], string> = {
  ringing: 'Ringing',
  connecting: 'Connecting',
  disclosing: 'Calling',
  live: 'Live',
  ended: 'Ended',
  failed: 'Failed',
  missed: 'Missed',
}

/** A Rep's phone, docked under every page: a microphone check, number and dial pad, ring and answer, mute, hold and hang up, and the Disclosure state of the Call. */
export function Softphone(props: {
  readonly pollMs?: number
  /** Registers the browser for Call audio (the Twilio Voice SDK); without it the panel places and reads Calls but carries no audio. */
  readonly connect?: VoiceConnector
}) {
  const pollMs = props.pollMs ?? POLL_MS
  const app = useApp()
  const [open, setOpen] = useState(false)
  const router = useRouter({ warn: false })
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY)
  const [number, setNumber] = useState('')
  const e164 = buildE164(country, number)
  const [call, setCall] = useState<SoftphoneCall | null>(null)
  const [placing, setPlacing] = useState(false)
  const [answering, setAnswering] = useState(false)
  const [hungUp, setHungUp] = useState(false)
  const [muted, setMuted] = useState(false)
  const [held, setHeld] = useState(false)
  const [error, setError] = useState<{
    readonly message: string
    readonly link?: 'conversation' | 'lines'
  } | null>(null)
  const [mic, setMic] = useState<Mic>('idle')
  const [ringing, setRinging] = useState<readonly SoftphoneCall[]>([])
  const [dismissed, setDismissed] = useState<readonly string[]>([])
  const stream = useRef<MediaStream | null>(null)
  const leg = useRef<VoiceLeg | null>(null)
  const [audio, setAudio] = useState<'off' | 'ready' | 'failed'>('off')
  const inCall = call !== null && !TERMINAL.includes(call.state) && !hungUp
  const busy = placing || answering || inCall

  const release = useCallback(() => {
    for (const track of stream.current?.getTracks() ?? []) {
      track.stop()
    }
    stream.current = null
    setMic('idle')
    setMuted(false)
    setHeld(false)
  }, [])
  useEffect(() => release, [release])

  // The Rep's microphone is silent while muted or on hold; the SDK leg carries the audio.
  useEffect(() => {
    leg.current?.mute(muted || held)
    for (const track of stream.current?.getAudioTracks() ?? []) {
      track.enabled = !(muted || held)
    }
  }, [muted, held])

  // Register the browser for Call audio; the token is asked for again before it runs out.
  const connect = props.connect
  useEffect(() => {
    if (connect === undefined) {
      return undefined
    }
    let handle: { destroy: () => void } | null = null
    let gone = false
    connect({
      getToken: () => app.calls.token(),
      onLeg: (next) => {
        leg.current = next
        next?.mute(false)
      },
    }).then(
      (made) => {
        if (gone) {
          made?.destroy()
        } else {
          handle = made
          setAudio(made === null ? 'failed' : 'ready')
        }
      },
      () => setAudio('failed')
    )
    return () => {
      gone = true
      handle?.destroy()
    }
  }, [app, connect])

  const checkMic = useCallback(async (): Promise<boolean> => {
    if (stream.current !== null) {
      return true
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMic('unavailable')
      return false
    }
    setMic('checking')
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      setMic('ready')
      return true
    } catch (caught) {
      setMic(
        caught instanceof DOMException && caught.name === 'NotFoundError' ? 'unavailable' : 'denied'
      )
      return false
    }
  }, [])

  // A bare check proves the permission, then lets the microphone go until a Call needs it.
  async function probeMic() {
    if (await checkMic()) {
      for (const track of stream.current?.getTracks() ?? []) {
        track.stop()
      }
      stream.current = null
    }
  }

  // Idle: look for inbound Calls ringing for this Rep.
  useEffect(() => {
    if (busy) {
      return undefined
    }
    const control = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      let next = pollMs
      try {
        setRinging(await app.calls.listRinging(control.signal))
      } catch {
        next = pollMs * 10 // shortcut: a failed read waits longer and says nothing; the panel shows only what it knows
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

  // On a Call: follow its state until it is over.
  const callId = inCall ? call.id : null
  useEffect(() => {
    if (callId === null) {
      return undefined
    }
    const control = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let failures = 0
    const tick = async () => {
      try {
        const next = await app.calls.get(callId, control.signal)
        failures = 0
        if (!control.signal.aborted) {
          setCall(next)
        }
      } catch {
        // The next read tries again, waiting longer after each miss; a Call that really ended is told by a later answer.
        failures = Math.min(failures + 1, 4)
      }
      if (!control.signal.aborted) {
        timer = setTimeout(tick, pollMs * 2 ** failures)
      }
    }
    timer = setTimeout(tick, pollMs)
    return () => {
      control.abort()
      clearTimeout(timer)
    }
  }, [app, callId, pollMs])

  // The Call is over: let go of the microphone.
  const over = call !== null && !inCall
  useEffect(() => {
    if (over) {
      release()
    }
  }, [over, release])

  async function dial() {
    setError(null)
    if (e164 === '' || !(await checkMic())) {
      return
    }
    setPlacing(true)
    setHungUp(false)
    setCall(null)
    const attempt = app.keys.begin(fingerprint.softphoneCall(e164))
    try {
      setCall(await app.calls.place(e164, attempt.key))
      attempt.succeeded()
    } catch (caught) {
      attempt.failed(caught)
      setError(presentCall(caught))
      release()
    } finally {
      setPlacing(false)
    }
  }

  async function answer(ringingCall: SoftphoneCall) {
    setError(null)
    if (!(await checkMic())) {
      return
    }
    setAnswering(true)
    setHungUp(false)
    try {
      setCall(await app.calls.answer(ringingCall.id))
    } catch (caught) {
      setError(presentCall(caught))
      if (caught instanceof ApiError && caught.code === VOICE_ERRORS['call.not_ringing'].code) {
        setDismissed((now) => [...now, ringingCall.id])
      }
      release()
    } finally {
      setAnswering(false)
    }
  }

  async function hangUp() {
    if (call === null) {
      return
    }
    setError(null)
    try {
      setCall(await app.calls.hangUp(call.id))
      leg.current?.disconnect()
      setHungUp(true)
    } catch (caught) {
      setError(presentCall(caught))
    }
  }

  // Close puts away everything the panel kept: the open flag, the last error and a finished Call.
  function toggle() {
    if (expanded) {
      setOpen(false)
      setError(null)
      setCall(null)
      setHungUp(false)
    } else {
      setOpen(true)
    }
  }

  const incoming = ringing.filter((item) => !dismissed.includes(item.id))[0]
  const status = placing
    ? `Calling ${e164}. The Disclosure plays before you are connected.`
    : answering
      ? 'Answering. The Disclosure plays before you are connected.'
      : call !== null
        ? `${hungUp ? 'You hung up' : STATE_WORDS[call.state]}, ${call.prospectNumber}. ${disclosureWords(call)}.`
        : incoming !== undefined && !busy
          ? `Incoming call from ${incoming.prospectNumber}.`
          : 'Idle.'
  const expanded = open || busy || call !== null || error !== null

  return (
    <section
      aria-label='Softphone'
      className='fixed inset-x-0 bottom-0 z-20 max-h-[85dvh] overflow-y-auto border-t-2 border-rule-strong bg-background md:left-60'
    >
      <div className='flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 md:px-12 xl:px-16'>
        <h2 className='label-mono'>Softphone</h2>
        <p aria-live='polite' className='min-w-0 flex-1 text-sm'>
          {status}
        </p>
        {incoming !== undefined && !busy ? (
          <>
            <Button size='sm' onClick={() => answer(incoming)}>
              Answer
            </Button>
            <Button
              size='sm'
              variant='link'
              onClick={() => setDismissed((now) => [...now, incoming.id])}
            >
              Dismiss
            </Button>
          </>
        ) : null}
        <Button
          size='sm'
          variant='link'
          aria-expanded={expanded}
          aria-controls='softphone-body'
          disabled={busy}
          onClick={toggle}
        >
          {expanded ? 'Close' : 'Open'}
        </Button>
      </div>
      {expanded ? (
        <div
          id='softphone-body'
          className='grid gap-8 border-t px-4 py-5 md:px-12 lg:grid-cols-2 xl:px-16'
        >
          <div>
            <p className='label-mono'>Microphone</p>
            <p
              className={cn(
                'mt-1 text-sm',
                mic === 'denied' || mic === 'unavailable' ? 'text-destructive' : ''
              )}
            >
              {MIC_WORDS[mic]}
            </p>
            {mic === 'denied' || mic === 'unavailable' ? (
              <Button className='mt-2' size='sm' variant='outline' onClick={probeMic}>
                Retry the microphone
              </Button>
            ) : null}
            {audio === 'failed' ? (
              <p className='mt-2 text-sm text-destructive'>
                Call audio could not connect, so you will not hear Calls. Reload the page to try
                again.
              </p>
            ) : null}
            {mic === 'idle' && !busy ? (
              <Button className='mt-2' size='sm' variant='outline' onClick={probeMic}>
                Check the microphone
              </Button>
            ) : null}
            {error !== null ? (
              <p role='alert' className='mt-4 text-sm font-medium text-destructive'>
                <strong>Error: </strong>
                {error.message}
                {error.link === 'lines' ? (
                  <>
                    {' '}
                    <a
                      href='/lines'
                      className='underline'
                      onClick={(event) => {
                        if (router !== undefined) {
                          event.preventDefault()
                          void router.navigate({ to: '/lines' })
                        }
                      }}
                    >
                      Open Lines
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}
            {call !== null ? (
              <dl className='mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 border-t pt-3 text-sm'>
                <dt className='label-mono'>Number</dt>
                <dd>
                  <Untrusted value={call.prospectNumber} />
                </dd>
                <dt className='label-mono'>State</dt>
                <dd>{hungUp ? 'Hung up' : STATE_WORDS[call.state]}</dd>
                <dt className='label-mono'>Disclosure</dt>
                <dd>{disclosureWords(call)}</dd>
              </dl>
            ) : null}
            {inCall ? (
              <div className='mt-4 flex flex-wrap gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  aria-pressed={muted}
                  onClick={() => setMuted((now) => !now)}
                >
                  {muted ? 'Unmute' : 'Mute'}
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  aria-pressed={held}
                  onClick={() => setHeld((now) => !now)}
                >
                  {held ? 'Resume' : 'Hold'}
                </Button>
                <Button variant='destructive' size='sm' onClick={() => void hangUp()}>
                  Hang up
                </Button>
              </div>
            ) : null}
          </div>
          <form
            aria-label='Place a Call'
            onSubmit={(event) => {
              event.preventDefault()
              void dial()
            }}
          >
            <label className='label-mono' htmlFor='softphone-country'>
              Country calling code
            </label>
            <Select
              id='softphone-country'
              options={COUNTRY_OPTIONS}
              value={country}
              disabled={busy}
              className='mt-1 max-w-xs'
              onValueChange={(next) => setCountry(next as CountryCode)}
            />
            <label className='label-mono mt-4 block' htmlFor='softphone-number'>
              Number to call
            </label>
            <input
              id='softphone-number'
              type='tel'
              inputMode='tel'
              autoComplete='off'
              maxLength={MAX_NUMBER}
              value={number}
              disabled={busy}
              placeholder='555 010 0100'
              className='mt-1 block h-11 w-full max-w-xs border-b border-rule-strong bg-transparent font-mono text-base outline-hidden focus-visible:border-foreground'
              onChange={(event) => {
                // A pasted +… number picks its own country; the field keeps only the national part.
                const split = splitInternational(event.target.value, country)
                if (split === null) {
                  setNumber(event.target.value)
                } else {
                  setCountry(split.iso)
                  setNumber(split.national)
                }
              }}
            />
            <fieldset className='mt-4 grid max-w-xs grid-cols-3 border-t border-l min-w-0 p-0'>
              <legend className='sr-only'>Dial pad</legend>
              {KEYS.map((key) => (
                <button
                  key={key}
                  type='button'
                  disabled={busy || number.length >= MAX_NUMBER}
                  className='h-11 cursor-pointer border-r border-b font-mono text-base outline-hidden hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'
                  onClick={() => setNumber((now) => now + key)}
                >
                  {key}
                </button>
              ))}
            </fieldset>
            <div className='mt-4 flex gap-4'>
              <Button
                type='submit'
                aria-disabled={busy || e164 === ''}
                onClick={(e) => (busy || e164 === '') && e.preventDefault()}
              >
                Call
              </Button>
              <Button
                type='button'
                variant='link'
                disabled={busy || number === ''}
                onClick={() => setNumber((now) => now.slice(0, -1))}
              >
                Delete last digit
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  )
}
