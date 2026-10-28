import { afterEach, describe, expect, test } from 'bun:test'
import { CHAT_ERRORS, ERRORS } from 'tula-closeline-contract'
import { boot } from './boot.ts'
import { type ChatDeps, ChatError, sendMessage, startChat } from './client.ts'
import { CODES } from './codes.ts'
import { mountChatWidget } from './widget.ts'
import { CONSENT_TEXT } from './words.ts'

const config = { api: 'https://voice.example', key: 'k'.repeat(40) }
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers })
const err = (code: string) => ({ error: { code, message: 'x' } })
const disclosure = { index: 0, role: 'agent', text: 'I am an AI. <b>hi</b>', at: 'now' }

function harness(answers: Response[]) {
  const calls: { url: string; key: string | null; body: string }[] = []
  const waits: number[] = []
  const notes: string[] = []
  const shown: string[] = []
  let n = 0
  const deps: ChatDeps = {
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({
        url,
        key: new Headers(init.headers).get('idempotency-key'),
        body: String(init.body),
      })
      return answers[n++] ?? json(500, err('server.unavailable'))
    }) as unknown as typeof fetch,
    sleep: async (ms) => {
      waits.push(ms)
      shown.push(
        document.querySelector('[data-chat-test]')?.shadowRoot?.querySelector('.note')
          ?.textContent ?? ''
      )
    },
    newKey: () => `key-${calls.length}-${Math.random().toString(16).slice(2)}`,
    onWait: (seconds, reason) => void notes.push(`${reason}:${seconds}`),
  }
  return { deps, calls, waits, notes, shown }
}

test('every code the widget branches on is one the contract defines', () => {
  const known = new Set<string>([...Object.keys(ERRORS), ...Object.keys(CHAT_ERRORS)])
  expect(Object.values(CODES).filter((code) => !known.has(code))).toEqual([])
})

describe('client', () => {
  test('start returns the token and the disclosure as message 0', async () => {
    const h = harness([
      json(201, { sessionToken: 't'.repeat(40), expiresAt: 'x', messages: [disclosure] }),
    ])
    const out = await startChat(config, h.deps, 'https://site.example/p', 'start-key-0123456789')
    expect(out.messages[0]?.text).toContain('I am an AI')
    expect(h.calls[0]?.url).toBe(`https://voice.example/v1/public/chat/${config.key}/sessions`)
    expect(h.calls[0]?.key).toBeTruthy()
  })

  test('a 429 waits Retry-After and resends the same message id', async () => {
    const h = harness([
      json(429, err('rate.limited'), { 'retry-after': '12' }),
      json(200, { reply: { text: 'ok', deferred: false, handoffOffered: false, at: 'x' } }),
    ])
    expect(await sendMessage(config, h.deps, 'tok', 'id-1234567890abcdef', 'hi')).toBe('ok')
    expect(h.waits).toEqual([12000])
    expect(h.notes).toEqual(['rate:12'])
    expect(h.calls.map((c) => c.key)).toEqual(['id-1234567890abcdef', 'id-1234567890abcdef'])
  })

  test('a 409 in progress backs off and retries with the same id', async () => {
    const busy = () => json(409, err('request.idempotency_in_progress'))
    const h = harness([
      busy(),
      busy(),
      json(200, { reply: { text: 'done', deferred: false, handoffOffered: false, at: 'x' } }),
    ])
    expect(await sendMessage(config, h.deps, 'tok', 'id-1234567890abcdef', 'hi')).toBe('done')
    expect(h.waits).toHaveLength(2)
    expect(h.waits[1] ?? 0).toBeGreaterThan(h.waits[0] ?? 0)
    expect(new Set(h.calls.map((c) => c.key)).size).toBe(1)
  })

  test('any other error is thrown by its code, without retry', async () => {
    const h = harness([json(403, err('chat.origin_not_allowed'))])
    await expect(
      startChat(config, h.deps, 'https://site.example/', 'start-key-0123456789')
    ).rejects.toEqual(new ChatError('chat.origin_not_allowed'))
    expect(h.calls).toHaveLength(1)
  })
})

describe('widget', () => {
  afterEach(() => {
    for (const host of document.querySelectorAll('[data-chat-test]')) {
      host.remove()
    }
  })
  async function opened(answers: Response[]) {
    const h = harness(answers)
    const host = document.createElement('div')
    host.dataset.chatTest = ''
    document.body.append(host)
    mountChatWidget(host, config, h.deps).open()
    await Bun.sleep(5)
    const root = host.shadowRoot as ShadowRoot
    return { h, root }
  }
  const start = () =>
    json(201, { sessionToken: 't'.repeat(40), expiresAt: 'x', messages: [disclosure] })

  test('shows the disclosure first, as text and not as HTML', async () => {
    const { root } = await opened([start()])
    const first = root.querySelector('.log li')
    expect(first?.textContent).toBe('I am an AI. <b>hi</b>')
    expect(first?.querySelector('b')).toBeNull()
  })

  test('sends a message and shows the reply as text', async () => {
    const { root, h } = await opened([
      start(),
      json(200, {
        reply: { text: '<img src=x>', deferred: false, handoffOffered: false, at: 'x' },
      }),
    ])
    const input = root.querySelector('textarea') as HTMLTextAreaElement
    input.value = 'hello'
    ;(root.querySelector('form') as HTMLFormElement).requestSubmit()
    await Bun.sleep(5)
    const items = [...root.querySelectorAll('.log li')]
    expect(items.map((li) => li.getAttribute('data-role'))).toEqual(['agent', 'prospect', 'agent'])
    expect(items[2]?.textContent).toBe('<img src=x>')
    expect(root.querySelector('.log img')).toBeNull()
    expect(h.calls[1]?.body).toBe('{"text":"hello"}')
  })

  test('says when it is waiting out a rate limit', async () => {
    const { root, h } = await opened([
      start(),
      json(429, err('rate.limited'), { 'retry-after': '7' }),
      json(200, { reply: { text: 'ok', deferred: false, handoffOffered: false, at: 'x' } }),
    ])
    ;(root.querySelector('textarea') as HTMLTextAreaElement).value = 'hi'
    ;(root.querySelector('form') as HTMLFormElement).requestSubmit()
    await Bun.sleep(5)
    expect(h.waits).toEqual([7000])
    expect(h.shown.at(-1)).toContain('Waiting 7 seconds')
    expect(root.querySelectorAll('.log li')).toHaveLength(3)
  })

  test('a closed origin ends the chat with a plain message and locks the input', async () => {
    const { root } = await opened([json(403, err('chat.origin_not_allowed'))])
    expect(root.querySelector('.note')?.textContent).toBe('Chat is not available on this site.')
    expect((root.querySelector('textarea') as HTMLTextAreaElement).disabled).toBe(true)
  })
})

describe('widget start', () => {
  afterEach(() => {
    for (const host of document.querySelectorAll('[data-chat-test]')) {
      host.remove()
    }
  })
  async function mounted(answers: Response[]) {
    const h = harness(answers)
    const host = document.createElement('div')
    host.dataset.chatTest = ''
    document.body.append(host)
    const widget = mountChatWidget(host, config, h.deps)
    return { h, widget }
  }

  test('a retried start reuses its idempotency key', async () => {
    const { h, widget } = await mounted([json(503, err('server.unavailable'))])
    widget.open()
    await Bun.sleep(5)
    widget.open()
    await Bun.sleep(5)
    expect(h.calls.length).toBeGreaterThanOrEqual(2)
    expect(h.calls[1]?.key).toBe(h.calls[0]?.key as string)
  })

  test('the source url leaves out the query and fragment', async () => {
    history.replaceState(null, '', '/pricing?token=secret#frag')
    const { h, widget } = await mounted([])
    widget.open()
    await Bun.sleep(5)
    const body = h.calls[0]?.body ?? ''
    expect(body).not.toContain('secret')
    expect(body).not.toContain('frag')
    expect(body).toContain('/pricing')
    history.replaceState(null, '', '/')
  })
})

describe('boot', () => {
  const tag = (attrs: Record<string, string>) => {
    const t = document.createElement('script')
    for (const [k, v] of Object.entries(attrs)) {
      t.setAttribute(k, v)
    }
    return t
  }
  afterEach(() => {
    for (const host of document.querySelectorAll('[data-closeline-chat]')) {
      host.remove()
    }
  })
  const good = { 'data-key': 'k'.repeat(40), src: 'https://portal.example/chat-widget.js' }

  test('mounts once even when the snippet is loaded twice', () => {
    boot(tag(good))
    boot(tag(good))
    expect(document.querySelectorAll('[data-closeline-chat]').length).toBe(1)
  })

  test('two head copies mount one widget', () => {
    Object.defineProperty(document, 'body', { value: null, configurable: true })
    try {
      boot(tag(good))
      boot(tag(good))
    } finally {
      delete (document as unknown as { body?: unknown }).body
    }
    document.dispatchEvent(new Event('DOMContentLoaded'))
    expect(document.querySelectorAll('[data-closeline-chat]').length).toBe(1)
  })

  test('a bad data-api is ignored without throwing', () => {
    expect(() => boot(tag({ ...good, 'data-api': 'not a url' }))).not.toThrow()
    expect(document.querySelectorAll('[data-closeline-chat]').length).toBe(0)
  })

  test('waits for the body when loaded from the head', () => {
    const body = document.body
    Object.defineProperty(document, 'body', { value: null, configurable: true })
    try {
      boot(tag(good))
    } finally {
      delete (document as unknown as { body?: unknown }).body
    }
    expect(document.body).toBe(body)
    expect(document.querySelectorAll('[data-closeline-chat]').length).toBe(0)
    document.dispatchEvent(new Event('DOMContentLoaded'))
    expect(document.querySelectorAll('[data-closeline-chat]').length).toBe(1)
  })
})

describe('callback consent', () => {
  afterEach(() => {
    for (const host of document.querySelectorAll('[data-chat-test]')) {
      host.remove()
    }
  })
  const WORDING = { consentWordingId: `cwd_${'0'.repeat(31)}1`, consentWordingVersion: 1 }
  const start = () =>
    json(201, { sessionToken: 't'.repeat(40), expiresAt: 'x', messages: [disclosure] })
  const receipt = () => json(201, { received: true, receivedAt: 'x' })

  async function withCallback(answers: Response[]) {
    const h = harness([start(), ...answers])
    const host = document.createElement('div')
    host.dataset.chatTest = ''
    document.body.append(host)
    mountChatWidget(host, config, h.deps).open()
    await Bun.sleep(5)
    const root = host.shadowRoot as ShadowRoot
    const q = <T extends Element>(selector: string) => root.querySelector(selector) as T
    const fill = (name: string, phone: string) => {
      q<HTMLInputElement>('input[name=name]').value = name
      q<HTMLInputElement>('input[name=phone]').value = phone
    }
    const tick = () => {
      const box = q<HTMLInputElement>('input[type=checkbox]')
      box.checked = true
      box.dispatchEvent(new Event('change'))
    }
    const submit = async () => {
      q<HTMLFormElement>('form.cb').requestSubmit()
      await Bun.sleep(5)
    }
    const ask = async () => {
      q<HTMLButtonElement>('.ask').click()
      await Bun.sleep(5)
    }
    return { h, q, fill, tick, submit, ask }
  }

  test('shows the wording the version names, verbatim and as text', async () => {
    const t = await withCallback([json(200, WORDING)])
    await t.ask()
    expect(t.h.calls[1]?.url).toBe(
      `https://voice.example/v1/public/chat/${config.key}/consent-wording`
    )
    expect(t.q('.wording').textContent).toBe(CONSENT_TEXT[1] as string)
    expect(t.q<HTMLFormElement>('form.cb').hidden).toBe(false)
    expect(t.q<HTMLInputElement>('input[type=checkbox]').checked).toBe(false)
  })

  test('cannot be submitted until the box is ticked', async () => {
    const t = await withCallback([json(200, WORDING), receipt()])
    await t.ask()
    t.fill('Ada', '+14155550100')
    expect(t.q<HTMLButtonElement>('form.cb .send').disabled).toBe(true)
    await t.submit()
    expect(t.h.calls).toHaveLength(2)
    t.tick()
    expect(t.q<HTMLButtonElement>('form.cb .send').disabled).toBe(false)
  })

  test('sends the id, version, key and consent that were shown', async () => {
    const t = await withCallback([json(200, WORDING), receipt()])
    await t.ask()
    t.fill('Ada', '+14155550100')
    t.tick()
    await t.submit()
    const call = t.h.calls[2]
    expect(call?.url).toBe(
      `https://voice.example/v1/public/chat/sessions/${'t'.repeat(40)}/callback-consent`
    )
    expect(call?.key).toBeTruthy()
    expect(JSON.parse(call?.body ?? '{}')).toMatchObject({
      name: 'Ada',
      phone: '+14155550100',
      ...WORDING,
      callbackConsent: true,
    })
    expect(t.q('.note').textContent).toContain('call you')
  })

  test('a 429 waits and resends the same key', async () => {
    const t = await withCallback([
      json(200, WORDING),
      json(429, err('rate.limited'), { 'retry-after': '3' }),
      receipt(),
    ])
    await t.ask()
    t.fill('Ada', '+14155550100')
    t.tick()
    await t.submit()
    expect(t.h.waits).toEqual([3000])
    expect(t.h.calls[2]?.key).toBe(t.h.calls[3]?.key as string)
    expect(t.q('.note').textContent).toContain('call you')
  })

  test('a wording fetch failure shows an error and no form', async () => {
    const t = await withCallback([json(503, err('server.unavailable'))])
    await t.ask()
    expect(t.q('.note').textContent).toBe('Chat could not be reached. Try again in a moment.')
    expect(t.q<HTMLFormElement>('form.cb').hidden).toBe(true)
  })

  test('a version the widget has no text for shows no form', async () => {
    const t = await withCallback([json(200, { ...WORDING, consentWordingVersion: 999 })])
    await t.ask()
    expect(t.q<HTMLFormElement>('form.cb').hidden).toBe(true)
  })

  test('a changed wording is fetched again and unticked', async () => {
    const t = await withCallback([
      json(200, WORDING),
      json(422, err('chat.consent_wording_missing')),
      json(200, WORDING),
    ])
    await t.ask()
    t.fill('Ada', '+14155550100')
    t.tick()
    await t.submit()
    expect(t.q<HTMLInputElement>('input[type=checkbox]').checked).toBe(false)
    expect(t.q('.note').textContent).toContain('wording changed')
  })
})
