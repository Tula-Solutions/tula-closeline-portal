import {
  type ChatConfig,
  type ChatDeps,
  type ChatMessage,
  sendMessage,
  startChat,
} from './client.ts'
import { CSS } from './style.ts'
import { wordsFor } from './words.ts'

const MAX_TEXT = 2000

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  const { class: className, ...rest } = props
  Object.assign(node, rest)
  if (className !== undefined) {
    node.className = className
  }
  return node
}

/**
 * Mounts the Chat widget into a shadow root on `host`. Every message is set with `textContent`, so
 * Agent text is never parsed as HTML. The first message is the server's AI disclosure and is shown
 * as soon as the Chat starts; there is no way to hide it.
 */
export function mountChatWidget(
  host: HTMLElement,
  config: ChatConfig,
  baseDeps: Omit<ChatDeps, 'onWait'>
) {
  const shadow = host.attachShadow({ mode: 'open' })
  const style = el('style')
  style.textContent = CSS
  const root = el('div', { class: 'root' })
  const launch = el('button', { class: 'launch', type: 'button', textContent: 'Chat with us' })
  launch.setAttribute('aria-haspopup', 'dialog')
  const panel = el('section', { class: 'panel' })
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', 'Chat')
  const title = el('h1', { textContent: 'Chat' })
  const tag = el('span', { class: 'tag', textContent: 'AI assistant' })
  const close = el('button', { class: 'close', type: 'button', textContent: 'Close' })
  close.setAttribute('aria-label', 'Close chat')
  const header = el('header')
  header.append(title, tag, close)
  const log = el('ol', { class: 'log' })
  log.setAttribute('role', 'log')
  log.setAttribute('aria-live', 'polite')
  const note = el('p', { class: 'note' })
  note.setAttribute('role', 'status')
  const form = el('form')
  const input = el('textarea', { maxLength: MAX_TEXT, rows: 1 })
  input.setAttribute('aria-label', 'Your message')
  const send = el('button', { class: 'send', type: 'submit', textContent: 'Send' })
  form.append(input, send)
  panel.append(header, log, note, form)
  root.append(launch, panel)
  shadow.append(style, root)

  let token: string | undefined
  let ended = false
  let busy = false
  // The failed text and its id, kept so a retry of the same words is the same message.
  let pending: { id: string; text: string } | undefined

  const deps: ChatDeps = {
    ...baseDeps,
    onWait: (seconds, reason) => {
      note.textContent =
        reason === 'rate'
          ? `You are sending messages too fast. Waiting ${seconds} seconds, then sending again.`
          : 'Still working on your last message. Trying again.'
    },
  }

  function add(message: ChatMessage) {
    const li = el('li', { textContent: message.text })
    li.dataset.role = message.role
    log.append(li)
    log.scrollTop = log.scrollHeight
  }

  function lock(on: boolean) {
    busy = on
    const off = on || ended
    input.disabled = off
    send.disabled = off
    send.setAttribute('aria-disabled', String(off))
  }

  function fail(error: unknown) {
    const words = wordsFor(error instanceof Error ? error.message : '')
    note.textContent = words.text
    ended = words.ended
  }

  // One key until start succeeds, so a retry after a timeout never opens a second Chat.
  const startKey = baseDeps.newKey()

  async function begin() {
    lock(true)
    note.textContent = 'Connecting.'
    try {
      const started = await startChat(
        config,
        deps,
        // No query or fragment: the host page may carry tokens there.
        location.origin + location.pathname,
        startKey
      )
      token = started.token
      for (const m of started.messages) {
        add(m)
      }
      note.textContent = ''
    } catch (error) {
      fail(error)
    }
    lock(false)
    input.focus()
  }

  function open() {
    root.dataset.open = ''
    if (token === undefined && !busy && !ended) {
      void begin()
    } else {
      input.focus()
    }
  }

  launch.addEventListener('click', open)
  close.addEventListener('click', () => {
    delete root.dataset.open
    launch.focus()
  })
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      close.click()
    }
  })
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      form.requestSubmit()
    }
  })
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const text = input.value.trim()
    if (busy || ended || text === '') {
      return
    }
    if (token === undefined) {
      void begin()
      return
    }
    const message = pending?.text === text ? pending : { id: baseDeps.newKey(), text }
    pending = message
    if (log.querySelector(`[data-id="${message.id}"]`) === null) {
      add({ role: 'prospect', text })
      log.lastElementChild?.setAttribute('data-id', message.id)
    }
    input.value = ''
    note.textContent = ''
    lock(true)
    try {
      add({ role: 'agent', text: await sendMessage(config, deps, token, message.id, text) })
      pending = undefined
      note.textContent = ''
    } catch (error) {
      input.value = text
      fail(error)
    }
    lock(false)
    if (!ended) {
      input.focus()
    }
  })

  return { open }
}
