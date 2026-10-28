import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'

type Handler = (...args: unknown[]) => void
const devices: FakeDevice[] = []

class FakeDevice {
  handlers = new Map<string, Handler>()
  registers = 0
  destroyed = false
  tokens: string[] = []
  registerError: Error | undefined
  constructor(public token: string) {
    devices.push(this)
  }
  on(name: string, handler: Handler) {
    this.handlers.set(name, handler)
  }
  emit(name: string, ...args: unknown[]) {
    this.handlers.get(name)?.(...args)
  }
  async register() {
    this.registers++
    if (this.registerError) {
      throw this.registerError
    }
  }
  updateToken(token: string) {
    this.tokens.push(token)
  }
  destroy() {
    this.destroyed = true
  }
}

mock.module('@twilio/voice-sdk', () => ({ Device: FakeDevice }))
const { connectVoice } = await import('./voice-device.ts')

const globals = globalThis as { RTCPeerConnection?: unknown }
const sleep = async () => undefined
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  devices.length = 0
  globals.RTCPeerConnection = class {}
})
afterAll(() => {
  globals.RTCPeerConnection = undefined
})

describe('connectVoice', () => {
  test('is null in a browser without WebRTC', async () => {
    globals.RTCPeerConnection = undefined
    expect(await connectVoice({ getToken: async () => 't', onLeg: () => undefined })).toBeNull()
  })

  test('destroys the Device when register() rejects, and rejects', async () => {
    const proto = FakeDevice.prototype
    const original = proto.register
    proto.register = async () => {
      throw new Error('socket')
    }
    try {
      await expect(
        connectVoice({ getToken: async () => 't', onLeg: () => undefined, sleep })
      ).rejects.toThrow('socket')
      expect(devices[0]?.destroyed).toBe(true)
    } finally {
      proto.register = original
    }
  })

  test('re-registers (token refresh is left to expiry and token errors) when the Device unregisters, and reports ready', async () => {
    const ready: boolean[] = []
    let n = 0
    await connectVoice({
      getToken: async () => `t${n++}`,
      onLeg: () => undefined,
      onReady: (value) => ready.push(value),
      sleep,
    })
    const device = devices[0] as FakeDevice
    device.emit('unregistered')
    await settle()
    expect(device.registers).toBe(2)
    expect(device.tokens).toEqual([])
    expect(ready).toEqual([true])
  })

  test('retries a failing token refresh a bounded number of times, then reports not ready', async () => {
    const ready: boolean[] = []
    let calls = 0
    let live = false
    await connectVoice({
      getToken: async () => {
        if (live) {
          calls++
          throw new Error('offline')
        }
        return 't'
      },
      onLeg: () => undefined,
      onReady: (value) => ready.push(value),
      sleep,
    })
    live = true
    devices[0]?.emit('tokenWillExpire')
    await settle()
    expect(calls).toBe(3)
    expect(ready).toEqual([false])
  })

  test('a registration error with no Call recovers; a Call error does not', async () => {
    await connectVoice({ getToken: async () => 't', onLeg: () => undefined, sleep })
    const device = devices[0] as FakeDevice
    device.emit('error', new Error('call'), {})
    await settle()
    expect(device.registers).toBe(1)
    device.emit('error', new Error('registration'), undefined)
    await settle()
    expect(device.registers).toBe(2)
  })

  test('a transport error (31009) re-registers without fetching a new token', async () => {
    let fetched = 0
    await connectVoice({
      getToken: async () => `t${fetched++}`,
      onLeg: () => undefined,
      sleep,
    })
    const device = devices[0] as FakeDevice
    device.emit('error', Object.assign(new Error('transport'), { code: 31009 }), undefined)
    device.emit('unregistered')
    await settle()
    expect(fetched).toBe(1)
    expect(device.tokens).toEqual([])
    expect(device.registers).toBe(2)
  })

  test('a token error (31205) fetches a new token', async () => {
    let fetched = 0
    await connectVoice({ getToken: async () => `t${fetched++}`, onLeg: () => undefined, sleep })
    const device = devices[0] as FakeDevice
    device.emit('error', Object.assign(new Error('jwt'), { code: 31205 }), undefined)
    await settle()
    expect(fetched).toBe(2)
  })

  test('a storm of registration errors waits a growing, capped, jittered time between rounds', async () => {
    const waits: number[] = []
    await connectVoice({
      getToken: async () => 't',
      onLeg: () => undefined,
      sleep: async (ms) => void waits.push(ms),
    })
    const device = devices[0] as FakeDevice
    device.registerError = new Error('down')
    for (let round = 0; round < 8; round++) {
      device.emit('error', Object.assign(new Error('transport'), { code: 31009 }), undefined)
      await settle()
    }
    expect(waits.length).toBeGreaterThan(8)
    expect(Math.max(...waits)).toBeLessThanOrEqual(30_000)
    // the wait before a round grows: the last round waits longer than the first
    expect(waits.at(-1) as number).toBeGreaterThan(waits[0] as number)
  })

  test('does not recover after destroy', async () => {
    const handle = await connectVoice({ getToken: async () => 't', onLeg: () => undefined, sleep })
    handle?.destroy()
    devices[0]?.emit('unregistered')
    await settle()
    expect(devices[0]?.registers).toBe(1)
  })
})
