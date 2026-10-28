import { mountChatWidget } from './widget.ts'

/** Reads `data-key` and `data-api` from the embedding script tag and mounts the widget once. */
export function boot(tag: HTMLScriptElement | null) {
  const key = tag?.dataset.key
  if (tag === null || key === undefined || !/^[A-Za-z0-9_-]{32,64}$/.test(key)) {
    return
  }
  if (document.querySelector('[data-closeline-chat]') !== null) {
    return
  }
  // The route's origin check needs the visitor's browser to call the API itself, so `data-api` is
  // the API origin; it defaults to the origin this file came from.
  let api: string
  try {
    api = new URL(tag.dataset.api ?? tag.src).origin
  } catch {
    return
  }
  const mount = () => {
    if (document.querySelector('[data-closeline-chat]') !== null) {
      return
    }
    const host = document.createElement('div')
    host.dataset.closelineChat = ''
    document.body.append(host)
    mountChatWidget(
      host,
      { api, key },
      {
        fetch: globalThis.fetch.bind(globalThis),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        newKey: () => crypto.randomUUID(),
      }
    )
  }
  // A snippet in <head> runs before <body> exists.
  if (document.body === null) {
    document.addEventListener('DOMContentLoaded', mount, { once: true })
  } else {
    mount()
  }
}
