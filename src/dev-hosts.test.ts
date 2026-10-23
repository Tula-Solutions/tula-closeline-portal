import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { request } from 'node:http'
import { parseAllowedHosts } from './dev-hosts.ts'

describe('parseAllowedHosts', () => {
  test('is undefined when unset or empty, so Vite keeps its default', () => {
    expect(parseAllowedHosts(undefined)).toBeUndefined()
    expect(parseAllowedHosts('')).toBeUndefined()
    expect(parseAllowedHosts(' , ,')).toBeUndefined()
  })

  test('splits on commas, trims and drops empty entries', () => {
    expect(parseAllowedHosts(' a.example.com, ,B.Example.com,')).toEqual([
      'a.example.com',
      'b.example.com',
    ])
  })

  test('rejects an entry with a port, which Vite would never match', () => {
    expect(() => parseAllowedHosts('a.example.com:8080')).toThrow('PORTAL_DEV_ALLOWED_HOSTS')
  })

  test('rejects a value that would allow every host', () => {
    expect(() => parseAllowedHosts('true')).toThrow('PORTAL_DEV_ALLOWED_HOSTS')
    expect(() => parseAllowedHosts('a.example.com, TRUE')).toThrow('PORTAL_DEV_ALLOWED_HOSTS')
    expect(() => parseAllowedHosts('*')).toThrow('PORTAL_DEV_ALLOWED_HOSTS')
    expect(() => parseAllowedHosts('*.example.com')).toThrow('PORTAL_DEV_ALLOWED_HOSTS')
    expect(() => parseAllowedHosts('.example.com')).toThrow('PORTAL_DEV_ALLOWED_HOSTS')
  })
})

/** Sends GET / with an explicit Host header and returns the status. */
function status(port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/', headers: { host } }, (res) => {
      res.resume()
      resolve(res.statusCode ?? 0)
    })
    req.on('error', reject)
    req.end()
  })
}

/** Finds a port nothing listens on. */
function freePort(): number {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() })
  const port = probe.port
  probe.stop(true)
  return port ?? 0
}

describe('dev server Host check', () => {
  const listed = 'quiet-fox-1.trycloudflare.com'
  let server: ReturnType<typeof Bun.spawn>
  const port = freePort()

  // A child process: the DOM test preload replaces timers that Vite's own server needs.
  beforeAll(async () => {
    server = Bun.spawn(
      ['bunx', '--bun', 'vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
      {
        env: {
          ...process.env,
          PORTAL_DEV_ALLOWED_HOSTS: ` ${listed}, `,
          VITE_ENVIRONMENT: 'local',
        },
        stdout: 'ignore',
        stderr: 'ignore',
      }
    )
    for (let i = 0; i < 100; i++) {
      try {
        if ((await status(port, listed)) === 200) {
          return
        }
      } catch {
        // not listening yet
      }
      await Bun.sleep(100)
    }
    throw new Error('the dev server did not start')
  }, 30_000)

  afterAll(() => {
    server.kill()
  })

  test('answers 200 for a listed host', async () => {
    expect(await status(port, listed)).toBe(200)
  })

  test('answers 403 for a host that is not listed', async () => {
    expect(await status(port, 'evil.example.com')).toBe(403)
  })
})
