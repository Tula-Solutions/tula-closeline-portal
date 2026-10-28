import { describe, expect, test } from 'bun:test'
import { readFrames, type SseFrame } from '~/api/sse'

function body(...chunks: string[]) {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

describe('readFrames', () => {
  test('joins a frame split across chunks, reads CRLF and skips comments and a partial last frame', async () => {
    const frames: SseFrame[] = []
    await readFrames(
      body(
        ': hello\n\nid: a1\nev',
        'ent: x\r\ndata: {"n":',
        '1}\r\n\r\nid: a2\nevent: y\ndata: 2\n\nid: a3\nda'
      ),
      (frame) => frames.push(frame)
    )
    expect(frames).toEqual([
      { id: 'a1', event: 'x', data: '{"n":1}' },
      { id: 'a2', event: 'y', data: '2' },
    ])
  })
})
