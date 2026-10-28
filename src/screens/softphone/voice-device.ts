/** The browser leg of a Call: what the softphone can do to the audio it carries. */
export type VoiceLeg = {
  /** Stops or resumes sending the Rep's microphone. */
  readonly mute: (on: boolean) => void
  /** Drops the browser leg. */
  readonly disconnect: () => void
}

/** What a connector needs from the softphone. */
export type VoiceConnectorInit = {
  /** Fetches a fresh short-lived Voice SDK token; called again before it expires. */
  readonly getToken: () => Promise<string>
  /** Called with the leg when a Call reaches this browser, and with `null` when it ends. */
  readonly onLeg: (leg: VoiceLeg | null) => void
  /** Called with `false` when the browser can no longer take Calls and recovery has given up, `true` when it can again. */
  readonly onReady?: (ready: boolean) => void
  /** Waits between recovery attempts; replaced in tests. */
  readonly sleep?: (ms: number) => Promise<void>
}

const ATTEMPTS = 3
const BASE_MS = 500

/** Runs `step` up to ATTEMPTS times with jittered exponential waits, then rethrows the last failure. */
async function retried(step: () => Promise<void>, sleep: (ms: number) => Promise<void>) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await step()
    } catch (error) {
      if (attempt === ATTEMPTS) {
        throw error
      }
      await sleep(BASE_MS * 2 ** (attempt - 1) * (0.5 + Math.random() / 2))
    }
  }
}

/** Registers this browser to take Calls; resolves to a handle that unregisters, or `null` when the browser has no WebRTC. */
export type VoiceConnector = (init: VoiceConnectorInit) => Promise<{ destroy: () => void } | null>

/**
 * Registers the Twilio Voice SDK Device. Voice bridges the Rep's browser leg only after the
 * Disclosure has played, so an incoming leg is accepted at once: the Rep already chose to dial or answer.
 */
export const connectVoice: VoiceConnector = async ({ getToken, onLeg, onReady, sleep }) => {
  if (typeof RTCPeerConnection === 'undefined') {
    return null
  }
  const wait = sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const { Device } = await import('@twilio/voice-sdk')
  const device = new Device(await getToken(), {
    logLevel: 'error',
    closeProtection: false,
    edge: 'roaming',
  })
  let closed = false
  let recovering = false
  const refresh = async () => device.updateToken(await getToken())
  // A lost registration (the token ran out, the socket dropped) is rebuilt with a fresh token.
  const recover = async () => {
    if (closed || recovering) {
      return
    }
    recovering = true
    try {
      await retried(async () => {
        await refresh()
        await device.register()
      }, wait)
      onReady?.(true)
    } catch {
      onReady?.(false)
    } finally {
      recovering = false
    }
  }
  device.on('incoming', (call) => {
    call.accept()
    onLeg({ mute: (on) => call.mute(on), disconnect: () => call.disconnect() })
    const gone = () => onLeg(null)
    call.on('disconnect', gone)
    call.on('cancel', gone)
    call.on('error', gone)
  })
  device.on('tokenWillExpire', () => {
    retried(refresh, wait).catch(() => onReady?.(false))
  })
  device.on('unregistered', () => void recover())
  // An error with no Call is about the registration itself; a Call error is handled on the leg.
  device.on('error', (_error, call) => {
    if (call === undefined) {
      void recover()
    }
  })
  try {
    await device.register()
  } catch (error) {
    closed = true
    device.destroy()
    throw error
  }
  return {
    destroy: () => {
      closed = true
      device.destroy()
    },
  }
}
