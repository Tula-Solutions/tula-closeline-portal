import { GlobalRegistrator } from '@happy-dom/global-registrator'

// The DOM must exist before Testing Library is imported (its `screen` binds to `document.body`
// when the module loads), so this file is its own preload and runs first.
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
