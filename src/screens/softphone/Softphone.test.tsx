import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VOICE_ERRORS } from 'tula-closeline-contract'
import { createApp } from '~/app'
import { AppContext } from '~/app-context'
import { createReporter } from '~/report/reporter'
import { Softphone } from '~/screens/softphone/Softphone'
import type { VoiceConnector, VoiceLeg } from '~/screens/softphone/voice-device'
import { failure, fakeFetch, type Handler, json, route, TEST_ENV, tokens } from '~/testing/fixtures'

const ID = `call_${'a'.repeat(32)}`
function callBody(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    direction: 'outbound',
    state: 'live',
    prospectNumber: '+15550100',
    disclosure: { wordingVersion: 3, playedAt: '2026-10-28T10:00:00Z', aiAssisted: false },
    ...over,
  }
}

let mic: 'ok' | 'denied' = 'ok'
let stopped = 0
const original = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')

beforeEach(() => {
  mic = 'ok'
  stopped = 0
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: async () => {
        if (mic === 'denied') {
          throw new DOMException('no', 'NotAllowedError')
        }
        return {
          getTracks: () => [
            {
              stop: () => {
                stopped += 1
              },
            },
          ],
          getAudioTracks: () => [],
        }
      },
    },
  })
})

afterEach(() => {
  cleanup()
  if (original) {
    Object.defineProperty(navigator, 'mediaDevices', original)
  }
})

function mount(...handlers: Handler[]): ReturnType<typeof mountWith> {
  return mountWith(undefined, ...handlers)
}

function mountWith(connect: VoiceConnector | undefined, ...handlers: Handler[]) {
  const double = fakeFetch(...handlers)
  const app = createApp({
    env: TEST_ENV,
    reporter: createReporter(
      () => {},
      () => {}
    ),
    fetch: double.fetch,
    sleep: async () => {},
    random: () => 0,
  })
  app.session.start(tokens())
  render(
    <AppContext.Provider value={app}>
      <QueryClientProvider client={app.queryClient}>
        <Softphone pollMs={5} {...(connect ? { connect } : {})} />
      </QueryClientProvider>
    </AppContext.Provider>
  )
  return { calls: double.calls, user: userEvent.setup() }
}

const noRinging = route('GET', '/v1/calls', json(200, { items: [] }))
const status = () =>
  screen.getByLabelText('Softphone').querySelector('[aria-live]')?.textContent ?? ''

describe('Softphone', () => {
  test('a dialled Call shows the Disclosure, then live, then ended', async () => {
    // The Call ends only once the test has seen it live, so a slow runner cannot miss that state.
    let hungUp = false
    const { user, calls } = mount(
      route(
        'POST',
        '/v1/calls',
        json(201, {
          call: callBody({
            state: 'disclosing',
            disclosure: { wordingVersion: null, playedAt: null, aiAssisted: false },
          }),
        })
      ),
      route('GET', `/v1/calls/${ID}`, () => json(200, callBody(hungUp ? { state: 'ended' } : {}))),
      noRinging
    )
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await user.type(screen.getByLabelText('Number to call'), '+15550100')
    await user.click(screen.getByRole('button', { name: 'Call' }))
    await waitFor(() => expect(status()).toContain('Disclosure playing'))
    await waitFor(() => expect(status()).toContain('Live, +15550100. Disclosure played, v3.'))
    hungUp = true
    await waitFor(() => expect(status()).toContain('Ended, +15550100'))
    const place = calls.find((c) => c.method === 'POST')
    expect(place?.headers.get('idempotency-key')?.length).toBeGreaterThanOrEqual(16)
    // The microphone is released after the ended state renders, not with it.
    await waitFor(() => expect(stopped).toBeGreaterThan(0))
  })

  test('the dial pad fills the number field', async () => {
    const { user } = mount(noRinging)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await user.click(screen.getByRole('button', { name: '5' }))
    await user.click(screen.getByRole('button', { name: '#' }))
    expect((screen.getByLabelText('Number to call') as HTMLInputElement).value).toBe('5#')
  })

  test('mute and hold toggle while live, and hang up ends the panel', async () => {
    const { user } = mount(
      route('POST', '/v1/calls', json(201, { call: callBody() })),
      route('GET', `/v1/calls/${ID}`, json(200, callBody())),
      route('POST', `/v1/calls/${ID}/hangup`, json(200, callBody({ state: 'ended' }))),
      noRinging
    )
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await user.type(screen.getByLabelText('Number to call'), '+15550100')
    await user.click(screen.getByRole('button', { name: 'Call' }))
    const mute = await screen.findByRole('button', { name: 'Mute' })
    expect(screen.getByText('Microphone ready.')).toBeTruthy()
    await user.click(mute)
    expect(screen.getByRole('button', { name: 'Unmute' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByRole('button', { name: 'Hold' }))
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Hang up' }))
    await waitFor(() => expect(status()).toContain('You hung up'))
    expect(screen.queryByRole('button', { name: 'Hang up' })).toBeNull()
  })

  test('an inbound ring shows the caller number and Answer, and answering goes live', async () => {
    const { user } = mount(
      route(
        'GET',
        '/v1/calls',
        json(200, {
          items: [
            callBody({
              direction: 'inbound',
              state: 'ringing',
              prospectNumber: '+15550199',
              disclosure: { wordingVersion: null, playedAt: null, aiAssisted: false },
            }),
          ],
        })
      ),
      route(
        'POST',
        `/v1/calls/${ID}/answer`,
        json(200, callBody({ direction: 'inbound', prospectNumber: '+15550199' }))
      ),
      route('GET', `/v1/calls/${ID}`, json(200, callBody({ prospectNumber: '+15550199' })))
    )
    const answer = await screen.findByRole('button', { name: 'Answer' })
    expect(status()).toBe('Incoming call from +15550199.')
    await user.click(answer)
    await waitFor(() => expect(status()).toContain('Live, +15550199'))
  })

  test('another Rep answering first is said plainly', async () => {
    const { user } = mount(
      route(
        'GET',
        '/v1/calls',
        json(200, { items: [callBody({ direction: 'inbound', state: 'ringing' })] })
      ),
      route('POST', `/v1/calls/${ID}/answer`, failure(409, VOICE_ERRORS['call.not_ringing'].code))
    )
    await user.click(await screen.findByRole('button', { name: 'Answer' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Someone else answered')
    expect(screen.queryByRole('button', { name: 'Answer' })).toBeNull()
  })

  test('a failed Answer that is not "already taken" keeps the Call to answer again', async () => {
    const { user } = mount(
      route(
        'GET',
        '/v1/calls',
        json(200, { items: [callBody({ direction: 'inbound', state: 'ringing' })] })
      ),
      route('POST', `/v1/calls/${ID}/answer`, () => {
        throw new TypeError('network down')
      })
    )
    await user.click(await screen.findByRole('button', { name: 'Answer' }))
    await screen.findByRole('alert')
    expect(await screen.findByRole('button', { name: 'Answer' })).toBeTruthy()
  })

  test('a bare microphone check lets the microphone go again', async () => {
    const { user } = mount(noRinging)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await user.click(screen.getByRole('button', { name: 'Check the microphone' }))
    await screen.findByText('Microphone ready.')
    await waitFor(() => expect(stopped).toBe(1))
  })

  test('a denied microphone says so, places no Call, and retry works', async () => {
    mic = 'denied'
    const { user, calls } = mount(noRinging)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await user.type(screen.getByLabelText('Number to call'), '+15550100')
    await user.click(screen.getByRole('button', { name: 'Call' }))
    expect(await screen.findByText(/browser blocked the microphone/)).toBeTruthy()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
    mic = 'ok'
    await user.click(screen.getByRole('button', { name: 'Retry the microphone' }))
    expect(await screen.findByText('Microphone ready.')).toBeTruthy()
  })

  test('a refused number shows the contract code in plain words', async () => {
    const { user } = mount(
      route('POST', '/v1/calls', failure(422, VOICE_ERRORS['call.number_invalid'].code)),
      noRinging
    )
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await user.type(screen.getByLabelText('Number to call'), '12')
    await user.click(screen.getByRole('button', { name: 'Call' }))
    expect((await screen.findByRole('alert')).textContent).toContain('cannot be called')
  })

  test('the country starts on the United States and the Call goes out as +1 and the national number', async () => {
    const { user, calls } = mount(
      route('POST', '/v1/calls', json(201, { call: callBody() })),
      route('GET', `/v1/calls/${ID}`, json(200, callBody())),
      noRinging
    )
    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByLabelText('Country calling code').textContent).toContain('+1')
    expect(screen.getByLabelText('Country calling code').textContent).toContain('United States')
    await user.click(screen.getByRole('button', { name: '5' }))
    await user.click(screen.getByRole('button', { name: '5' }))
    await user.click(screen.getByRole('button', { name: '9' }))
    await user.click(screen.getByRole('button', { name: 'Delete last digit' }))
    expect((screen.getByLabelText('Number to call') as HTMLInputElement).value).toBe('55')
    await user.click(screen.getByRole('button', { name: '0' }))
    await user.click(screen.getByRole('button', { name: 'Call' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    expect(JSON.stringify(calls.find((c) => c.method === 'POST')?.body)).toContain('+1550')
  })

  test('another country changes the calling code that is sent', async () => {
    const { user, calls } = mount(
      route('POST', '/v1/calls', json(201, { call: callBody() })),
      route('GET', `/v1/calls/${ID}`, json(200, callBody())),
      noRinging
    )
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await user.click(screen.getByLabelText('Country calling code'))
    await user.click(await screen.findByRole('option', { name: /United Kingdom \+44/ }))
    await user.type(screen.getByLabelText('Number to call'), '2079460958')
    await user.click(screen.getByRole('button', { name: 'Call' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    expect(JSON.stringify(calls.find((c) => c.method === 'POST')?.body)).toContain('+442079460958')
  })

  test('a pasted +… number picks its country and leaves the national number', async () => {
    const { user } = mount(noRinging)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await user.click(screen.getByLabelText('Number to call'))
    await user.paste('+442079460958')
    expect((screen.getByLabelText('Number to call') as HTMLInputElement).value).toBe('2079460958')
    expect(screen.getByLabelText('Country calling code').textContent).toContain('+44')
  })

  test('no active Line points to the Lines page, and Close dismisses the panel', async () => {
    const { user } = mount(
      route('POST', '/v1/calls', failure(422, VOICE_ERRORS['call.line_unavailable'].code)),
      noRinging
    )
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await user.type(screen.getByLabelText('Number to call'), '5550100')
    await user.click(screen.getByRole('button', { name: 'Call' }))
    expect((await screen.findByRole('alert')).textContent).toContain('no active Line')
    expect(screen.getByRole('link', { name: 'Open Lines' }).getAttribute('href')).toBe('/lines')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByLabelText('Number to call')).toBeNull()
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy()
  })
})

describe('Softphone audio', () => {
  function fakeVoice() {
    const log: string[] = []
    let tokens = 0
    let hand: ((leg: VoiceLeg | null) => void) | undefined
    const connect: VoiceConnector = async ({ getToken, onLeg }) => {
      await getToken()
      tokens += 1
      hand = onLeg
      return { destroy: () => log.push('destroyed') }
    }
    const leg: VoiceLeg = {
      mute: (on) => log.push(`mute:${on}`),
      disconnect: () => log.push('disconnect'),
    }
    return { connect, log, leg, tokens: () => tokens, arrive: () => hand?.(leg) }
  }
  const tokenRoute = route(
    'POST',
    '/v1/softphone/token',
    json(200, {
      token: 'jwt',
      identity: `mem_${'b'.repeat(32)}`,
      ttlSeconds: 900,
      expiresAt: '2026-10-28T11:00:00Z',
    })
  )

  test('registers with a token from voice, mutes the leg, and hang up ends the Call and the leg', async () => {
    const voice = fakeVoice()
    const { user, calls } = mountWith(
      voice.connect,
      tokenRoute,
      route('POST', '/v1/calls', json(201, { call: callBody() })),
      route('GET', `/v1/calls/${ID}`, json(200, callBody())),
      route('POST', `/v1/calls/${ID}/hangup`, json(200, callBody({ state: 'ended' }))),
      noRinging
    )
    await waitFor(() => expect(voice.tokens()).toBe(1))
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await user.type(screen.getByLabelText('Number to call'), '+15550100')
    await user.click(screen.getByRole('button', { name: 'Call' }))
    await screen.findByRole('button', { name: 'Mute' })
    voice.arrive()
    await user.click(screen.getByRole('button', { name: 'Mute' }))
    expect(voice.log).toContain('mute:true')
    await user.click(screen.getByRole('button', { name: 'Hold' }))
    await user.click(screen.getByRole('button', { name: 'Unmute' }))
    expect(voice.log.at(-1)).toBe('mute:true') // still on hold
    await user.click(screen.getByRole('button', { name: 'Hang up' }))
    await waitFor(() => expect(status()).toContain('You hung up'))
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith(`/v1/calls/${ID}/hangup`))).toBe(
      true
    )
    expect(voice.log).toContain('disconnect')
  })

  test('a hang-up the server refuses says so and keeps the Call', async () => {
    const voice = fakeVoice()
    const { user } = mountWith(
      voice.connect,
      tokenRoute,
      route('POST', '/v1/calls', json(201, { call: callBody() })),
      route('GET', `/v1/calls/${ID}`, json(200, callBody())),
      route('POST', `/v1/calls/${ID}/hangup`, failure(503, 'server.unavailable')),
      noRinging
    )
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await user.type(screen.getByLabelText('Number to call'), '+15550100')
    await user.click(screen.getByRole('button', { name: 'Call' }))
    await user.click(await screen.findByRole('button', { name: 'Hang up' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hang up' })).toBeTruthy()
    expect(voice.log).not.toContain('disconnect')
  })

  test('a Rep who muted before the leg arrived is muted on arrival', async () => {
    const voice = fakeVoice()
    const { user } = mountWith(
      voice.connect,
      tokenRoute,
      route('POST', '/v1/calls', json(201, { call: callBody() })),
      route('GET', `/v1/calls/${ID}`, json(200, callBody())),
      noRinging
    )
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await user.type(screen.getByLabelText('Number to call'), '+15550100')
    await user.click(screen.getByRole('button', { name: 'Call' }))
    await user.click(await screen.findByRole('button', { name: 'Mute' }))
    voice.arrive()
    expect(voice.log).toEqual(['mute:true'])
  })

  test('audio that is lost after connecting is said plainly', async () => {
    let lose: ((ready: boolean) => void) | undefined
    mountWith(async ({ onReady }) => {
      lose = onReady
      return { destroy: () => undefined }
    }, noRinging)
    await user_open()
    await waitFor(() => expect(lose).toBeDefined())
    act(() => lose?.(false))
    expect(await screen.findByText(/Call audio could not connect/)).toBeTruthy()
  })

  test('an audio connection that fails is said plainly', async () => {
    mountWith(async () => null, noRinging)
    await user_open()
    expect(await screen.findByText(/Call audio could not connect/)).toBeTruthy()
  })
})

async function user_open() {
  await userEvent.setup().click(screen.getByRole('button', { name: 'Open' }))
}
