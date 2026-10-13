import { describe, expect, test } from 'bun:test'
import type { App, AppInit } from '~/app'
import { boot } from '~/boot'
import { EnvError } from '~/env'
import { noopReporter } from '~/report/reporter'

const TOKEN = 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5'

const RAW = {
  VITE_ENVIRONMENT: 'local',
}

function visit() {
  window.history.replaceState(null, '', `/sign-up#invitation=${TOKEN}`)
}

describe('boot', () => {
  test('takes the Invitation out of the address bar before the reporter starts', () => {
    visit()
    const seen: string[] = []
    const app = boot({
      raw: RAW,
      location: window.location,
      history: window.history,
      startReporting: () => {
        seen.push(window.location.href)
        return noopReporter
      },
    })
    expect(seen).toHaveLength(1)
    expect(seen[0]).not.toContain(TOKEN)
    expect(seen[0]).not.toContain('invitation')
    expect(app.invitation.current()).toEqual({ status: 'present', token: TOKEN })
  })

  test('takes it out before the configuration is read, so a bad configuration cannot leave it', () => {
    visit()
    expect(() => boot({ raw: {}, location: window.location, history: window.history })).toThrow(
      EnvError
    )
    expect(window.location.href).not.toContain(TOKEN)
  })

  test('takes it out before the app is built, so a crash while building cannot leave it', () => {
    visit()
    const hrefs: string[] = []
    expect(() =>
      boot({
        raw: RAW,
        location: window.location,
        history: window.history,
        startReporting: () => noopReporter,
        createApp: (_init: AppInit): App => {
          hrefs.push(window.location.href)
          throw new Error('boom')
        },
      })
    ).toThrow('boom')
    expect(hrefs).toHaveLength(1)
    expect(hrefs[0]).not.toContain(TOKEN)
  })

  test('hands the app the same holder that took the Invitation', () => {
    visit()
    const app = boot({
      raw: RAW,
      location: window.location,
      history: window.history,
      startReporting: () => noopReporter,
    })
    expect(app.invitation.current().status).toBe('present')
  })

  test('gives the held Invitation to the reporter to redact, and nothing when none is held', () => {
    visit()
    const redacted: string[] = []
    const reporter = { ...noopReporter, redact: (secret: string) => redacted.push(secret) }
    boot({
      raw: RAW,
      location: window.location,
      history: window.history,
      startReporting: () => reporter,
    })
    expect(redacted).toEqual([TOKEN])

    window.history.replaceState(null, '', '/sign-up')
    boot({
      raw: RAW,
      location: window.location,
      history: window.history,
      startReporting: () => reporter,
    })
    expect(redacted).toEqual([TOKEN])
  })
})
