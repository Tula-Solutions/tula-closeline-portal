import { CODES } from './codes.ts'

/** A message of a Chat as the public route returns it. */
export type ChatMessage = { readonly role: 'prospect' | 'agent'; readonly text: string }

/** Where the Chat routes live and which site key the visitor chats through. */
export type ChatConfig = { readonly api: string; readonly key: string }

/** What the client needs from its surroundings; tests replace all of it. */
export type ChatDeps = {
  readonly fetch: typeof fetch
  readonly sleep: (ms: number) => Promise<void>
  readonly newKey: () => string
  /** Called before each wait, so the screen can say why nothing is happening. */
  readonly onWait: (seconds: number, reason: 'rate' | 'busy') => void
}

/** A failed Chat call, carrying the `area.reason` code the screen words. */
export class ChatError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

/** Not a service code: the answer was not shaped as the contract says. */
const RESPONSE_INVALID = 'client.response_invalid'
const MAX_ATTEMPTS = 6
const MAX_WAIT_S = 60
const DEFAULT_RATE_WAIT_S = 5
const CALL_TIMEOUT_MS = 30_000

type Json = Record<string, unknown>

async function codeOf(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { code?: unknown } }
    return typeof body.error?.code === 'string' ? body.error.code : CODES.unavailable
  } catch {
    return CODES.unavailable
  }
}

function retryAfterSeconds(res: Response): number {
  const value = Number(res.headers.get('retry-after'))
  return Number.isFinite(value) && value > 0
    ? Math.min(Math.ceil(value), MAX_WAIT_S)
    : DEFAULT_RATE_WAIT_S
}

/**
 * POSTs one Idempotency-Key until it is answered: waits out a 429 by `Retry-After`, backs off a 409
 * (the first try is still in flight) and a dropped connection, always resending the same key.
 */
async function post(config: ChatConfig, deps: ChatDeps, path: string, key: string, body: Json) {
  let busy = 0
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res: Response
    try {
      res = await deps.fetch(`${config.api}/v1/public/chat/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key },
        body: JSON.stringify(body),
        referrerPolicy: 'no-referrer',
        credentials: 'omit',
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      })
    } catch {
      res = new Response(null, { status: 599 })
    }
    if (res.ok) {
      return (await res.json()) as Json
    }
    let seconds: number
    let reason: 'rate' | 'busy'
    if (res.status === 429) {
      seconds = retryAfterSeconds(res)
      reason = 'rate'
    } else if (
      res.status === 599 ||
      (res.status === 409 && (await codeOf(res)) === CODES.inProgress)
    ) {
      // 0.5 s, 1 s, 2 s ... up to 8 s, with up to 25% jitter.
      seconds = Math.min(0.5 * 2 ** busy++, 8) * (1 + Math.random() * 0.25)
      reason = 'busy'
    } else {
      throw new ChatError(await codeOf(res))
    }
    deps.onWait(Math.ceil(seconds), reason)
    await deps.sleep(seconds * 1000)
  }
  throw new ChatError(CODES.unavailable)
}

function messagesOf(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    throw new ChatError(RESPONSE_INVALID)
  }
  return value.map((m: { role?: unknown; text?: unknown }) => {
    if ((m.role !== 'prospect' && m.role !== 'agent') || typeof m.text !== 'string') {
      throw new ChatError(RESPONSE_INVALID)
    }
    return { role: m.role, text: m.text }
  })
}

/** Starts a Chat under one key the caller reuses until it succeeds; message 0 of the answer is the fixed AI disclosure. */
export async function startChat(
  config: ChatConfig,
  deps: ChatDeps,
  sourceUrl: string,
  idempotencyKey: string
) {
  const out = await post(config, deps, `${config.key}/sessions`, idempotencyKey, { sourceUrl })
  if (typeof out.sessionToken !== 'string') {
    throw new ChatError(RESPONSE_INVALID)
  }
  return { token: out.sessionToken, messages: messagesOf(out.messages) }
}

/** Sends one visitor message under its own id (reused on every retry) and returns the Agent's reply. */
export async function sendMessage(
  config: ChatConfig,
  deps: ChatDeps,
  token: string,
  messageId: string,
  text: string
): Promise<string> {
  const out = (await post(config, deps, `sessions/${token}/messages`, messageId, { text })) as {
    reply?: { text?: unknown }
  }
  if (typeof out.reply?.text !== 'string') {
    throw new ChatError(RESPONSE_INVALID)
  }
  return out.reply.text
}
