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
}

/** Registers this browser to take Calls; resolves to a handle that unregisters, or `null` when the browser has no WebRTC. */
export type VoiceConnector = (init: VoiceConnectorInit) => Promise<{ destroy: () => void } | null>

/**
 * Registers the Twilio Voice SDK Device. Voice bridges the Rep's browser leg only after the
 * Disclosure has played, so an incoming leg is accepted at once: the Rep already chose to dial or answer.
 */
export const connectVoice: VoiceConnector = async ({ getToken, onLeg }) => {
  if (typeof RTCPeerConnection === 'undefined') {
    return null
  }
  const { Device } = await import('@twilio/voice-sdk')
  const device = new Device(await getToken(), { logLevel: 'error', closeProtection: false })
  device.on('incoming', (call) => {
    call.accept()
    onLeg({ mute: (on) => call.mute(on), disconnect: () => call.disconnect() })
    const gone = () => onLeg(null)
    call.on('disconnect', gone)
    call.on('cancel', gone)
    call.on('error', gone)
  })
  device.on('tokenWillExpire', () => {
    // A failed refresh leaves the old token to run out; the next Call then fails and says so.
    getToken()
      .then((token) => device.updateToken(token))
      .catch(() => undefined)
  })
  await device.register()
  return { destroy: () => device.destroy() }
}
