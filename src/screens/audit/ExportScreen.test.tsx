import { describe, expect, test } from 'bun:test'
import { screen, waitFor, within } from '@testing-library/react'
import { EXPORT_ERRORS } from 'tula-closeline-contract'
import { exportJobBody, exportPartBody } from '~/testing/audit-bodies'
import { page } from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const EXPORTS = '/v1/exports'

function visit(
  role: 'owner' | 'admin' | 'manager' | 'rep',
  handlers: Handler[],
  assign?: (url: string) => void
) {
  return renderPortal({
    url: '/export',
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers,
    ...(assign ? { assign } : {}),
  })
}

const everyState = route(
  'GET',
  EXPORTS,
  json(
    200,
    page([
      exportJobBody(5, {
        state: 'running',
        completedAt: null,
        expiresAt: null,
        parts: [exportPartBody('core', 'ready'), exportPartBody('playbook', 'pending')],
      }),
      exportJobBody(4, {
        state: 'failed',
        failureReason: 'timed_out',
        completedAt: null,
        expiresAt: null,
        parts: [exportPartBody('core', 'ready'), exportPartBody('voice', 'failed')],
      }),
      exportJobBody(3, { state: 'ready', includeRecordingLinks: true }),
      exportJobBody(2, { state: 'expired', expiresAt: '2026-10-01T00:00:00Z' }),
      exportJobBody(1, { state: 'queued', completedAt: null, expiresAt: null, parts: [] }),
    ])
  )
)

describe('Export: who may see it', () => {
  test.each(['manager', 'rep'] as const)(
    'a %s sees a notice and nothing is requested',
    async (role) => {
      const portal = visit(role, [everyState])
      expect(await screen.findByText(/Only an Owner or Admin can export/)).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Request export' })).toBeNull()
      expect(portal.calls.some((call) => call.path.startsWith(EXPORTS))).toBe(false)
    }
  )
})

describe('Export: the states', () => {
  test('every state renders in words', async () => {
    visit('owner', [everyState])
    const list = await screen.findByRole('list', { name: 'Exports' })
    const items = within(list)
      .getAllByRole('listitem')
      .filter((li) => li.parentElement === list)
    expect(items.length).toBe(5)

    const running = items[0] as HTMLElement
    expect(within(running).getByText('Running', { selector: '[data-slot="status"]' })).toBeTruthy()
    expect(within(running).getByText(/checks again by itself/)).toBeTruthy()
    expect(within(running).queryByRole('button', { name: /Download/ })).toBeNull()

    const failed = items[1] as HTMLElement
    expect(within(failed).getByText('Failed', { selector: '[data-slot="status"]' })).toBeTruthy()
    expect(within(failed).getByText(/took too long/)).toBeTruthy()
    expect(within(failed).queryByRole('button', { name: /Download/ })).toBeNull()

    const ready = items[2] as HTMLElement
    expect(within(ready).getByText('Ready', { selector: '[data-slot="status"]' })).toBeTruthy()
    expect(within(ready).getByText(/Includes links to call recordings/)).toBeTruthy()
    expect(within(ready).getByRole('button', { name: /Download/ })).toBeTruthy()

    const expired = items[3] as HTMLElement
    expect(within(expired).getByText('Expired', { selector: '[data-slot="status"]' })).toBeTruthy()
    expect(within(expired).getByText(/Ask for a new one/)).toBeTruthy()
    expect(within(expired).queryByRole('button', { name: /Download/ })).toBeNull()

    const queued = items[4] as HTMLElement
    expect(within(queued).getByText('Queued', { selector: '[data-slot="status"]' })).toBeTruthy()
  })

  test.each([
    ['part_failed', /could not be written/],
    ['storage_unavailable', /storage was not available/],
  ] as const)('a failed export says why: %s', async (reason, words) => {
    visit('admin', [
      route(
        'GET',
        EXPORTS,
        json(200, page([exportJobBody(1, { state: 'failed', failureReason: reason })]))
      ),
    ])
    const list = await screen.findByRole('list', { name: 'Exports' })
    expect(within(list).getByText(words)).toBeTruthy()
  })

  test('says when there are none', async () => {
    visit('owner', [route('GET', EXPORTS, json(200, page([])))])
    expect(await screen.findByText('Nothing has been exported yet.')).toBeTruthy()
  })

  test('says what went wrong and offers to try again', async () => {
    visit('owner', [route('GET', EXPORTS, failure(503, 'server.unavailable'))])
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  test('shows a loading state before the list arrives', async () => {
    visit('owner', [() => new Promise<Response>(() => {})])
    expect((await screen.findAllByText(/Loading exports/)).length).toBeGreaterThan(0)
  })
})

describe('Export: asking for one', () => {
  test('sends the recording-links choice with an idempotency key', async () => {
    const portal = visit('owner', [
      (call) =>
        call.method === 'POST' && call.path === EXPORTS
          ? json(
              202,
              exportJobBody(9, { state: 'queued', completedAt: null, expiresAt: null, parts: [] })
            )
          : null,
      route('GET', EXPORTS, json(200, page([]))),
    ])
    await screen.findByText('Nothing has been exported yet.')
    await portal.user.click(
      screen.getByRole('checkbox', { name: 'Include links to call recordings' })
    )
    await portal.user.click(screen.getByRole('button', { name: 'Request export' }))
    await waitFor(() => {
      const post = portal.calls.find((call) => call.method === 'POST' && call.path === EXPORTS)
      expect(post?.body).toMatchObject({ includeRecordingLinks: true })
      expect(post?.headers.get('idempotency-key')).toBeTruthy()
    })
    expect(await screen.findByText(/Export requested/)).toBeTruthy()
  })

  test.each([
    ['export.already_running', 409, /already running/],
    ['export.daily_limit', 429, /two exports in 24 hours/],
  ] as const)('%s is said in words', async (code, status, words) => {
    expect(EXPORT_ERRORS[code].code).toBe(code)
    const portal = visit('owner', [
      (call) => (call.method === 'POST' ? failure(status, code) : null),
      route('GET', EXPORTS, json(200, page([]))),
    ])
    await screen.findByText('Nothing has been exported yet.')
    await portal.user.click(screen.getByRole('button', { name: 'Request export' }))
    expect(await screen.findByText(words)).toBeTruthy()
  })
})

describe('Export: downloading', () => {
  test('asks for a link and leaves for it, without showing or keeping it', async () => {
    const left: string[] = []
    const url = 'https://files.example.test/export.zip?signature=secret-value'
    const portal = visit(
      'admin',
      [
        (call) =>
          call.method === 'POST' && call.path.endsWith('/download-links')
            ? json(200, {
                exportId: call.path.split('/')[3],
                url,
                expiresAt: '2099-01-01T00:00:00Z',
              })
            : null,
        route('GET', EXPORTS, json(200, page([exportJobBody(3)]))),
      ],
      (to) => left.push(to)
    )
    await portal.user.click(await screen.findByRole('button', { name: /Download/ }))
    await waitFor(() => expect(left).toEqual([url]))
    expect(document.body.textContent).not.toContain('secret-value')
    expect(document.body.innerHTML).not.toContain('secret-value')
  })

  test('an expired link answer is said in words and nothing is opened', async () => {
    const left: string[] = []
    const portal = visit(
      'admin',
      [
        (call) =>
          call.method === 'POST' && call.path.endsWith('/download-links')
            ? failure(410, EXPORT_ERRORS['export.expired'].code)
            : null,
        route('GET', EXPORTS, json(200, page([exportJobBody(3)]))),
      ],
      (to) => left.push(to)
    )
    await portal.user.click(await screen.findByRole('button', { name: /Download/ }))
    expect(await screen.findByText(/has expired/)).toBeTruthy()
    expect(left).toEqual([])
  })
})
