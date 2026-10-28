/**
 * Fails when the built site names a service URL: the browser calls its own origin only, so no
 * absolute auth or core address may be in the bundle. Usage: bun scripts/check-bundle.ts out/verify
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const directory = process.argv[2]
if (directory === undefined) {
  throw new Error('usage: bun scripts/check-bundle.ts <build directory>')
}

function files(path: string): string[] {
  return readdirSync(path).flatMap((name) => {
    const full = join(path, name)
    return statSync(full).isDirectory() ? files(full) : [full]
  })
}

const FORBIDDEN = [
  /(?:127\.0\.0\.1|localhost):300[0-9]/,
  /\b(?:AUTH|CORE)_(?:PROXY_TARGET|BASE_URL)\b/,
  /VITE_(?:AUTH|CORE)_BASE_URL/,
]
const offenders = files(directory)
  .filter((path) => /\.(js|html|css|json|map)$/.test(path) && !path.endsWith('.map'))
  .filter((path) => FORBIDDEN.some((pattern) => pattern.test(readFileSync(path, 'utf8'))))
if (offenders.length > 0) {
  console.error(
    `A service address is in the built site:\n${offenders.map((p) => `  ${p}`).join('\n')}`
  )
  process.exit(1)
}
// The embeddable widget is loaded by other sites as a classic script, so it must import nothing.
const widget = readFileSync(join(directory, 'chat-widget.js'), 'utf8')
if (/^import[\s{]/m.test(widget)) {
  console.error('chat-widget.js imports a chunk; it must be self-contained')
  process.exit(1)
}
// A classic script's top-level names land in the host page's global scope.
if (!widget.startsWith('(()=>{')) {
  console.error('chat-widget.js must be wrapped in a function')
  process.exit(1)
}
console.log(`No service address in ${directory}`)
