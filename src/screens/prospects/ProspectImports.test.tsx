import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import {
  ERRORS,
  IDEMPOTENCY_KEY_HEADER,
  PROSPECT_ERRORS,
  PROSPECT_IMPORT_COLUMNS,
  PROSPECT_IMPORT_INVALID_REASONS,
  PROSPECT_IMPORT_REJECT_REASONS,
  PROSPECT_IMPORT_SKIP_REASONS,
} from 'tula-closeline-contract'
import { ROW_REASON_WORDS } from '~/data/prospect-imports'
import {
  companyBody,
  hexId,
  memberBody,
  page,
  prospectBody,
  prospectImportBody,
  prospectImportRowBody,
  runningImportBody,
} from '~/testing/core-bodies'
import { failure, type Handler, json, route } from '~/testing/fixtures'
import { gatedSleep, param, type Role, visit } from '~/testing/sales'
import { choose } from '~/testing/select'

const IMPORTS = '/v1/prospect-imports'

function open(url: string, role: Role, handlers: Handler[], sleep?: (ms: number) => Promise<void>) {
  return visit(
    url,
    role,
    [
      ...handlers,
      route('GET', '/v1/prospects', json(200, page([prospectBody(1)]))),
      route('GET', '/v1/prospect-companies', json(200, page([companyBody(1, 'Acme')]))),
      route('GET', '/v1/members', json(200, page([memberBody(1, { name: 'Maya Chen' })]))),
    ],
    sleep ? { sleep } : {}
  )
}

afterEach(() => {
  cleanup()
})

describe('Prospect import: who may import', () => {
  test('an Admin finds the Import link on the Prospects list; a Rep does not', async () => {
    open('/prospects', 'admin', [])
    const link = await screen.findByRole('link', { name: 'Import Prospects' })
    expect(link.getAttribute('href')).toBe('/prospects/imports')
    cleanup()
    open('/prospects', 'rep', [])
    await screen.findByText('First1 Last1')
    expect(screen.queryByRole('link', { name: 'Import Prospects' })).toBeNull()
  })

  test.each(['manager', 'rep'] as const)(
    'a %s who opens the page is told it is not for them and nothing is requested',
    async (role) => {
      const portal = open('/prospects/imports', role, [])
      expect(await screen.findByText('Not allowed')).toBeTruthy()
      expect(portal.calls.filter((call) => call.path.startsWith(IMPORTS))).toHaveLength(0)
    }
  )
})

describe('Prospect import: step 1, choose a file', () => {
  const csv = (
    name = 'prospects.csv',
    text = 'first_name,last_name,email\r\nAnn,Lee,ann@x.com\r\n'
  ) => new File([text], name, { type: 'text/csv' })
  const chooser = () => screen.getByLabelText(/choose a csv/i)
  const choose = (...files: File[]) => fireEvent.change(chooser(), { target: { files } })
  const status = () => screen.getByRole('status', { name: 'Import upload' })
  const uploadError = () =>
    waitFor(() => {
      const text = status().textContent ?? ''
      if (!text.includes('Error:')) {
        throw new Error('no error yet')
      }
      return text
    })
  const posts = (portal: ReturnType<typeof open>) =>
    portal.calls.filter((call) => call.method === 'POST' && call.path === IMPORTS)
  const original = {
    create: URL.createObjectURL,
    revoke: URL.revokeObjectURL,
    click: HTMLAnchorElement.prototype.click,
  }
  // A real anchor click would navigate the test window away from the page under test.
  beforeEach(() => {
    HTMLAnchorElement.prototype.click = () => {}
  })
  afterEach(() => {
    URL.createObjectURL = original.create
    URL.revokeObjectURL = original.revoke
    HTMLAnchorElement.prototype.click = original.click
  })
  const empty = route('GET', IMPORTS, json(200, page([])))

  test('shows the three steps with the first one current', async () => {
    open('/prospects/imports', 'owner', [empty])
    const steps = await screen.findByRole('list', { name: 'Steps' })
    const items = within(steps).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Choose a file'),
      expect.stringContaining('Watch progress'),
      expect.stringContaining('Read the report'),
    ])
    expect(items[0]?.getAttribute('aria-current')).toBe('step')
  })

  test('the template download is the contract header and one example row', async () => {
    let blob: Blob | undefined
    URL.createObjectURL = (made: Blob | MediaSource) => {
      blob = made as Blob
      return 'blob:template'
    }
    URL.revokeObjectURL = () => {}
    open('/prospects/imports', 'owner', [empty])
    const link = await screen.findByRole('link', { name: 'Download the CSV template' })
    expect(link.getAttribute('download')).toBe('prospect-import-template.csv')
    expect(link.getAttribute('href')).toBe('blob:template')
    const lines = (await (blob as Blob).text()).split('\r\n')
    expect(lines[0]).toBe(PROSPECT_IMPORT_COLUMNS.join(','))
    expect(lines[1]?.split(',').length).toBe(PROSPECT_IMPORT_COLUMNS.length)
  })

  test('the limits are shown before anything is chosen', async () => {
    open('/prospects/imports', 'owner', [empty])
    const hint = await screen.findByText(/10 MB/)
    expect(hint.textContent).toMatch(/50,000 rows/)
  })

  test.each([
    ['prospects.xlsx', 'first_name,email\r\n', /CSV/],
    ['empty.csv', '', /empty/],
  ])(
    '%s is stopped in the browser with a reason, and nothing is sent',
    async (name, text, words) => {
      const portal = open('/prospects/imports', 'owner', [empty])
      await screen.findByLabelText(/choose a csv/i)
      choose(csv(name, text))
      expect(await uploadError()).toMatch(words)
      expect(posts(portal)).toHaveLength(0)
    }
  )

  test('a file over the limit is stopped in the browser and the limit is named', async () => {
    const portal = open('/prospects/imports', 'owner', [empty])
    await screen.findByLabelText(/choose a csv/i)
    const big = csv()
    Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 })
    choose(big)
    expect(await uploadError()).toContain('10 MB')
    expect(posts(portal)).toHaveLength(0)
  })

  test('202: sends the file as multipart with an idempotency key and moves on to the import', async () => {
    const made = runningImportBody(5, 'uploaded')
    const portal = open('/prospects/imports', 'admin', [
      route('POST', IMPORTS, json(202, made)),
      empty,
      route('GET', `${IMPORTS}/${made.id}`, json(200, made)),
    ])
    await screen.findByLabelText(/choose a csv/i)
    choose(csv('prospects.csv'))
    await waitFor(() =>
      expect(portal.router.state.location.pathname).toBe(`/prospects/imports/${made.id}`)
    )
    const call = posts(portal)[0]
    expect(call?.headers.get(IDEMPOTENCY_KEY_HEADER)).toMatch(/^portal-/)
    expect(call?.headers.get('content-type')).toBeNull()
    const form = call?.init.body
    expect(form instanceof FormData).toBe(true)
    expect(((form as FormData).get('file') as File).name).toBe('prospects.csv')
    expect(await screen.findByText('Uploaded, waiting to start')).toBeTruthy()
  })

  test.each([
    [PROSPECT_IMPORT_INVALID_REASONS[0], /not a CSV/],
    [PROSPECT_IMPORT_INVALID_REASONS[1], /larger than 10 MB/],
    [PROSPECT_IMPORT_INVALID_REASONS[2], /first row does not match/],
    [PROSPECT_IMPORT_INVALID_REASONS[3], /more than 50,000 rows/],
  ] as const)('core refusing the file for %s is explained by its reason', async (reason, words) => {
    open('/prospects/imports', 'owner', [
      route(
        'POST',
        IMPORTS,
        failure(422, PROSPECT_ERRORS['prospect.import_invalid'].code, { reason })
      ),
      empty,
    ])
    await screen.findByLabelText(/choose a csv/i)
    choose(csv())
    expect(await uploadError()).toMatch(words)
  })

  test('a refusal with a reason this build does not know still says the file was refused', async () => {
    open('/prospects/imports', 'owner', [
      route(
        'POST',
        IMPORTS,
        failure(422, PROSPECT_ERRORS['prospect.import_invalid'].code, { reason: 'from_the_future' })
      ),
      empty,
    ])
    await screen.findByLabelText(/choose a csv/i)
    choose(csv())
    expect(await uploadError()).toMatch(/file was not accepted/i)
  })

  test('a 403 is explained by its code', async () => {
    open('/prospects/imports', 'owner', [
      route('POST', IMPORTS, failure(403, ERRORS['auth.forbidden'].code)),
      empty,
    ])
    await screen.findByLabelText(/choose a csv/i)
    choose(csv())
    expect(await uploadError()).toMatch(/role does not allow/)
  })

  test('a 503 may have been stored: a retry sends the same idempotency key', async () => {
    const made = runningImportBody(6, 'uploaded')
    let attempts = 0
    const portal = open('/prospects/imports', 'owner', [
      route('POST', IMPORTS, () => {
        attempts += 1
        return attempts === 1 ? failure(503, ERRORS['server.unavailable'].code) : json(202, made)
      }),
      empty,
      route('GET', `${IMPORTS}/${made.id}`, json(200, made)),
    ])
    await screen.findByLabelText(/choose a csv/i)
    choose(csv())
    await uploadError()
    await portal.user.click(screen.getByRole('button', { name: /^Retry/ }))
    await waitFor(() => expect(posts(portal)).toHaveLength(2))
    expect(posts(portal)[1]?.headers.get(IDEMPOTENCY_KEY_HEADER)).toBe(
      posts(portal)[0]?.headers.get(IDEMPOTENCY_KEY_HEADER)
    )
  })
})

describe('Prospect import: the imports list, safe to leave and return', () => {
  test('lists every import with its state and counts, a running one included, each with a link to open it', async () => {
    const running = runningImportBody(2)
    const done = prospectImportBody(1)
    open('/prospects/imports', 'owner', [route('GET', IMPORTS, json(200, page([running, done])))])
    const table = await screen.findByRole('region', { name: 'Imports' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('Processing')
    expect(rows[1]?.textContent).toContain('Completed')
    const links = within(table).getAllByRole('link', { name: /^Open/ })
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `/prospects/imports/${running.id}`,
      `/prospects/imports/${done.id}`,
    ])
  })

  test('a running import in the list is asked about again, and shows done once it is', async () => {
    const gate = gatedSleep()
    let reads = 0
    const running = runningImportBody(2)
    open(
      '/prospects/imports',
      'owner',
      [
        route('GET', IMPORTS, () => {
          reads += 1
          return json(200, page([reads >= 2 ? prospectImportBody(2) : running]))
        }),
      ],
      gate.sleep
    )
    await screen.findByText('Processing')
    await waitFor(() => expect(gate.waits).toHaveLength(1))
    expect(gate.waits[0]).toBeGreaterThanOrEqual(3_000)
    gate.release()
    await screen.findByText('Completed')
  })

  test('says so when there are no imports', async () => {
    open('/prospects/imports', 'owner', [route('GET', IMPORTS, json(200, page([])))])
    expect(await screen.findByText('There are no imports yet.')).toBeTruthy()
  })
})

describe('Prospect import: step 2, watch progress', () => {
  test('opening an import that is still running shows its live status and follows it to the end', async () => {
    const gate = gatedSleep()
    let reads = 0
    const running = runningImportBody(1)
    open(
      `/prospects/imports/${running.id}`,
      'owner',
      [
        route('GET', `${IMPORTS}/${running.id}`, () => {
          reads += 1
          return json(200, reads >= 2 ? prospectImportBody(1) : running)
        }),
        route('GET', `${IMPORTS}/${running.id}/rows`, json(200, page([]))),
      ],
      gate.sleep
    )
    await screen.findByText('Processing')
    expect(screen.getByRole('listitem', { current: 'step' }).textContent).toContain(
      'Watch progress'
    )
    expect(screen.getByText(/leave this page and come back/i)).toBeTruthy()
    await waitFor(() => expect(gate.waits).toHaveLength(1))
    expect(gate.waits[0]).toBeGreaterThanOrEqual(3_000)
    gate.release()
    await screen.findByText('Completed')
    expect(screen.getByRole('listitem', { current: 'step' }).textContent).toContain(
      'Read the report'
    )
    gate.release()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(reads).toBe(2)
  })

  test.each([
    ['too_many_rows', /more than 50,000 rows/],
    ['unreadable', /could not be read as a CSV/],
    ['processing_failed', /could not process this file in time/],
  ] as const)(
    'a failed import (%s) says why in words and offers no report',
    async (reason, words) => {
      const failed = prospectImportBody(1, {
        state: 'failed',
        failureReason: reason,
        rowCount: null,
        createdCount: null,
        updatedCount: null,
        skippedCount: null,
        rejectedCount: null,
      })
      const portal = open(`/prospects/imports/${failed.id}`, 'owner', [
        route('GET', `${IMPORTS}/${failed.id}`, json(200, failed)),
      ])
      expect((await screen.findByRole('alert')).textContent).toMatch(words)
      expect(screen.queryByRole('button', { name: 'Download the report (CSV)' })).toBeNull()
      expect(portal.calls.filter((call) => call.path.endsWith('/rows'))).toHaveLength(0)
    }
  )

  test('an import that is gone is explained', async () => {
    const id = hexId('pimp', 9)
    open(`/prospects/imports/${id}`, 'owner', [
      route('GET', `${IMPORTS}/${id}`, failure(404, PROSPECT_ERRORS['prospect.not_found'].code)),
    ])
    expect((await screen.findByRole('alert')).textContent).toMatch(/no longer exists/)
  })
})

describe('Prospect import: step 3, read the report', () => {
  const original = {
    create: URL.createObjectURL,
    revoke: URL.revokeObjectURL,
    click: HTMLAnchorElement.prototype.click,
  }
  // A real anchor click would navigate the test window away from the page under test.
  beforeEach(() => {
    HTMLAnchorElement.prototype.click = () => {}
  })
  afterEach(() => {
    URL.createObjectURL = original.create
    URL.revokeObjectURL = original.revoke
    HTMLAnchorElement.prototype.click = original.click
  })
  const rowsPath = (id: string) => `${IMPORTS}/${id}/rows`

  test('success: the counts, and every row with a link to its Prospect', async () => {
    const done = prospectImportBody(1, {
      rowCount: 2,
      createdCount: 1,
      updatedCount: 1,
      skippedCount: 0,
      rejectedCount: 0,
    })
    const portal = open(`/prospects/imports/${done.id}`, 'admin', [
      route('GET', `${IMPORTS}/${done.id}`, json(200, done)),
      route(
        'GET',
        rowsPath(done.id),
        json(
          200,
          page([
            prospectImportRowBody(2, { result: 'created' }),
            prospectImportRowBody(3, { result: 'updated' }),
          ])
        )
      ),
    ])
    const table = await screen.findByRole('region', { name: 'Report rows' })
    const counts = screen.getByRole('list', { name: 'Result counts' }).textContent ?? ''
    expect(counts).toMatch(/2\s*rows/)
    expect(counts).toMatch(/1\s*created/i)
    expect(counts).toMatch(/1\s*updated/i)
    const created = within(table).getByText('Created').closest('tr') as HTMLElement
    expect(
      within(created)
        .getByRole('link', { name: /Open Prospect/ })
        .getAttribute('href')
    ).toBe(`/prospects/${hexId('prs', 2)}`)
    const asked = portal.calls.find((c) => c.path === rowsPath(done.id))
    expect(param(asked?.url ?? '', 'result')).toBeNull()
  })

  test('partial failure: skipped and rejected rows say why in words, with no link for a rejected one', async () => {
    const done = prospectImportBody(1)
    const bad = prospectImportRowBody(4, {
      result: 'rejected',
      reason: 'invalid_email',
      prospectId: null,
    })
    const portal = open(`/prospects/imports/${done.id}`, 'owner', [
      route('GET', `${IMPORTS}/${done.id}`, json(200, done)),
      route('GET', rowsPath(done.id), (call) =>
        json(
          200,
          page(
            param(call.url, 'result') === 'rejected'
              ? [bad]
              : [
                  prospectImportRowBody(2, { result: 'created' }),
                  prospectImportRowBody(3, { result: 'skipped', reason: 'manual_values_kept' }),
                  bad,
                ]
          )
        )
      ),
    ])
    const table = await screen.findByRole('region', { name: 'Report rows' })
    const skipped = within(table).getByText('Skipped').closest('tr') as HTMLElement
    expect(skipped.textContent).toContain(ROW_REASON_WORDS.manual_values_kept)
    const rejected = within(table).getByText('Rejected').closest('tr') as HTMLElement
    expect(rejected.textContent).toContain(ROW_REASON_WORDS.invalid_email)
    expect(within(rejected).queryByRole('link')).toBeNull()
    await choose(portal.user, screen.getByLabelText('Show'), 'rejected')
    await waitFor(() =>
      expect(
        portal.calls.some(
          (c) => c.path === rowsPath(done.id) && param(c.url, 'result') === 'rejected'
        )
      ).toBe(true)
    )
    await waitFor(() => {
      const fresh = screen.getByRole('region', { name: 'Report rows' })
      expect(within(fresh).queryByText('Created')).toBeNull()
      expect(within(fresh).getByText('Rejected')).toBeTruthy()
    })
  })

  test('the report pages with the cursor', async () => {
    const done = prospectImportBody(1)
    const portal = open(`/prospects/imports/${done.id}`, 'owner', [
      route('GET', `${IMPORTS}/${done.id}`, json(200, done)),
      route('GET', rowsPath(done.id), (call) =>
        param(call.url, 'cursor') === 'c2'
          ? json(200, page([prospectImportRowBody(9, { result: 'updated' })]))
          : json(200, page([prospectImportRowBody(2, { result: 'created' })], 'c2'))
      ),
    ])
    const table = await screen.findByRole('region', { name: 'Report rows' })
    await within(table).findByText('Created')
    await portal.user.click(screen.getByRole('button', { name: 'Load more rows' }))
    expect(await within(table).findByText('Updated')).toBeTruthy()
  })

  test('a filter with no rows says so', async () => {
    const done = prospectImportBody(1, { rowCount: 4, rejectedCount: 0 })
    const portal = open(`/prospects/imports/${done.id}`, 'owner', [
      route('GET', `${IMPORTS}/${done.id}`, json(200, done)),
      route('GET', rowsPath(done.id), (call) =>
        json(200, page(param(call.url, 'result') === 'rejected' ? [] : [prospectImportRowBody(2)]))
      ),
    ])
    const table = await screen.findByRole('region', { name: 'Report rows' })
    await within(table).findByText('Created')
    await choose(portal.user, screen.getByLabelText('Show'), 'rejected')
    expect(await screen.findByText('No row has this result.')).toBeTruthy()
  })

  test('the report downloads as the CSV core sends, not a rebuilt one', async () => {
    const text =
      'row_number,result,reason,prospect_id\r\n2,created,,prs_1\r\n3,rejected,invalid_email,\r\n'
    let blob: Blob | undefined
    let createdAt = 0
    const reportUrl = `blob:report-${crypto.randomUUID()}`
    URL.createObjectURL = (made: Blob | MediaSource) => {
      blob = made as Blob
      createdAt = performance.now()
      return reportUrl
    }
    let revokedAt: number | undefined
    // Count only this URL: another test's leftover revoke timer can fire during this one.
    URL.revokeObjectURL = (revoked: string) => {
      if (revoked === reportUrl) {
        revokedAt = performance.now()
      }
    }
    const done = prospectImportBody(1)
    const portal = open(`/prospects/imports/${done.id}`, 'owner', [
      route('GET', `${IMPORTS}/${done.id}`, json(200, done)),
      route('GET', rowsPath(done.id), json(200, page([prospectImportRowBody(2)]))),
      route(
        'GET',
        `${IMPORTS}/${done.id}/report.csv`,
        () => new Response(text, { status: 200, headers: { 'content-type': 'text/csv' } })
      ),
    ])
    await portal.user.click(
      await screen.findByRole('button', { name: 'Download the report (CSV)' })
    )
    await waitFor(() => expect(blob).toBeDefined())
    // The browser may start the save after click() returns, so the URL must outlive the click.
    // Compare timestamps, not a flag read after a wait whose length depends on the runner.
    await waitFor(() => expect(revokedAt).toBeDefined(), { timeout: 3_000 })
    expect((revokedAt as number) - createdAt).toBeGreaterThanOrEqual(900)
    expect(await (blob as Blob).text()).toBe(text)
    const call = portal.calls.find((c) => c.path.endsWith('/report.csv'))
    expect(call?.headers.get('accept')).toContain('text/csv')
  })

  test('a report that cannot be fetched says so and can be tried again', async () => {
    const done = prospectImportBody(1)
    let tries = 0
    let revoked = false
    URL.createObjectURL = () => 'blob:report'
    URL.revokeObjectURL = () => {
      revoked = true
    }
    const portal = open(`/prospects/imports/${done.id}`, 'owner', [
      route('GET', `${IMPORTS}/${done.id}`, json(200, done)),
      route('GET', rowsPath(done.id), json(200, page([prospectImportRowBody(2)]))),
      route('GET', `${IMPORTS}/${done.id}/report.csv`, () => {
        tries += 1
        return tries === 1
          ? failure(404, PROSPECT_ERRORS['prospect.not_found'].code)
          : new Response('row_number,result,reason,prospect_id\r\n', { status: 200 })
      }),
    ])
    const button = await screen.findByRole('button', { name: 'Download the report (CSV)' })
    await portal.user.click(button)
    expect((await screen.findByRole('alert')).textContent).toMatch(/no longer exists/)
    await portal.user.click(screen.getByRole('button', { name: 'Download the report (CSV)' }))
    await waitFor(() => expect(tries).toBe(2))
    // Let the screen's 1 s revoke timer fire here, not inside the next test.
    await waitFor(() => expect(revoked).toBe(true), { timeout: 3_000 })
  })
})

describe('Prospect import: the words', () => {
  test('every reason core can give a row has words', () => {
    for (const reason of [...PROSPECT_IMPORT_REJECT_REASONS, ...PROSPECT_IMPORT_SKIP_REASONS]) {
      expect(ROW_REASON_WORDS[reason]).toBeString()
      expect(ROW_REASON_WORDS[reason].length).toBeGreaterThan(10)
    }
  })
})
