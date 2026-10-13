import { describe, expect, test } from 'bun:test'
import { createBroadcastSessionChannel, type SessionMessage } from '~/session/session'

describe('the BroadcastChannel line between tabs', () => {
  test('delivers "signed_out" to the other tab and carries nothing but the type', async () => {
    const posted: unknown[] = []
    const original = globalThis.BroadcastChannel
    class Spy {
      onmessage: ((event: MessageEvent) => void) | null = null
      private readonly listeners = new Set<(event: MessageEvent) => void>()
      postMessage(data: unknown) {
        posted.push(data)
        for (const listener of this.listeners) {
          listener({ data } as MessageEvent)
        }
      }
      addEventListener(_type: string, listener: (event: MessageEvent) => void) {
        this.listeners.add(listener)
      }
      removeEventListener(_type: string, listener: (event: MessageEvent) => void) {
        this.listeners.delete(listener)
      }
      close() {}
    }
    globalThis.BroadcastChannel = Spy as unknown as typeof BroadcastChannel
    try {
      const line = createBroadcastSessionChannel()
      expect(line).not.toBeNull()
      const heard: SessionMessage[] = []
      line?.subscribe((message) => heard.push(message))
      line?.post({ type: 'signed_out', accessToken: 'leak' } as SessionMessage)
      expect(posted).toEqual([{ type: 'signed_out' }])
      expect(heard).toEqual([{ type: 'signed_out' }])
    } finally {
      globalThis.BroadcastChannel = original
    }
  })

  test('ignores a message that is not one of the two known types', () => {
    const original = globalThis.BroadcastChannel
    let deliver: (event: MessageEvent) => void = () => {}
    class Fake {
      postMessage() {}
      addEventListener(_type: string, listener: (event: MessageEvent) => void) {
        deliver = listener
      }
      removeEventListener() {}
      close() {}
    }
    globalThis.BroadcastChannel = Fake as unknown as typeof BroadcastChannel
    try {
      const heard: SessionMessage[] = []
      createBroadcastSessionChannel()?.subscribe((message) => heard.push(message))
      deliver({ data: { type: 'something-else' } } as MessageEvent)
      deliver({ data: 'signed_out' } as MessageEvent)
      deliver({ data: null } as MessageEvent)
      expect(heard).toEqual([])
    } finally {
      globalThis.BroadcastChannel = original
    }
  })

  test('is null where the browser has no BroadcastChannel, and the session still works without it', () => {
    const original = globalThis.BroadcastChannel
    // @ts-expect-error simulating a browser without the API
    globalThis.BroadcastChannel = undefined
    try {
      expect(createBroadcastSessionChannel()).toBeNull()
    } finally {
      globalThis.BroadcastChannel = original
    }
  })
})
