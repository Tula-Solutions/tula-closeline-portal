import { afterEach, describe, expect, jest, test } from 'bun:test'
import { createHttpClient } from '~/api/http'
import { createVoiceApi } from '~/api/voice'
import { json } from '~/testing/fixtures'

afterEach(() => jest.useRealTimers())

describe('sendTryMessage', () => {
  test('a reply that arrives after 15 seconds is still accepted', async () => {
    jest.useFakeTimers()
    const turn = {
      index: 1,
      role: 'agent',
      text: 'Slow but here.',
      sources: [],
      deferred: false,
      toolCall: null,
      at: '2026-10-01T10:00:00.000Z',
    }
    const http = createHttpClient({
      fetch: (_url, init) =>
        new Promise((resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError')))
          setTimeout(() => resolve(json(200, { reply: turn })), 15_000)
        }),
    })
    const pending = createVoiceApi(http).sendTryMessage(`try_${'0'.repeat(31)}1`, 'hi', 'key')
    jest.advanceTimersByTime(15_000)
    expect((await pending).text).toBe('Slow but here.')
  })
})
