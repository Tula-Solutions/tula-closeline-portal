import { boot } from './boot.ts'

/** The script tag that loaded this file; read at load, because it is null afterwards. */
const script = document.currentScript

boot(script instanceof HTMLScriptElement ? script : null)
