/** One Server-Sent Events frame: its `id:`, `event:` and joined `data:` lines. */
export type SseFrame = { readonly id: string; readonly event: string; readonly data: string }

/** Reads a Server-Sent Events body to its end and hands over each complete frame; comment lines and a partial last frame are dropped. */
export async function readFrames(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: SseFrame) => void
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        return
      }
      pending += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n')
      for (let end = pending.indexOf('\n\n'); end !== -1; end = pending.indexOf('\n\n')) {
        const frame = parseFrame(pending.slice(0, end))
        pending = pending.slice(end + 2)
        if (frame !== null) {
          onFrame(frame)
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function parseFrame(block: string): SseFrame | null {
  let id = ''
  let event = 'message'
  const data: string[] = []
  for (const line of block.split('\n')) {
    const colon = line.indexOf(':')
    if (colon <= 0) {
      continue // a comment (starts with ':') or a line with no field
    }
    const value = line.slice(colon + 1).replace(/^ /, '')
    const field = line.slice(0, colon)
    if (field === 'id') {
      id = value
    } else if (field === 'event') {
      event = value
    } else if (field === 'data') {
      data.push(value)
    }
  }
  return data.length === 0 ? null : { id, event, data: data.join('\n') }
}
