import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'bun:test'

// Bun's own `fetch`, `Response`, `Headers`, `Request` and `AbortController` stay in place;
// happy-dom adds the DOM (window, document, history, location). Tests inject `fetch` into the app.
const bun = {
  fetch: globalThis.fetch,
  Response: globalThis.Response,
  Headers: globalThis.Headers,
  Request: globalThis.Request,
  AbortController: globalThis.AbortController,
  AbortSignal: globalThis.AbortSignal,
}

GlobalRegistrator.register({ url: 'http://localhost:3000/' })
Object.assign(globalThis, bun)
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  localStorage.clear()
  sessionStorage.clear()
})
