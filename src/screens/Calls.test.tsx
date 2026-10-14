import { describe, expect, test } from 'bun:test'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import {
  CALL_FAILURE_FIXES,
  CALL_FAILURE_REASONS,
  ERRORS,
  SALES_HISTORY_ERRORS,
} from 'tula-closeline-contract'
import { callBody, dealBody, hexId, page, rightsBody } from '~/testing/core-bodies'
import { failure, json, route, tokens } from '~/testing/fixtures'
import { gatedSleep, param, visit } from '~/testing/sales'

const PB = '/v1/playbook'
const CALLS = `${PB}/calls`
const DEALS = `${PB}/deals`
const RIGHTS = `${PB}/rights-confirmation`
const IDEMPOTENCY = 'idempotency-key'

/** A Recording: the only kind that can be transcribed or wait for a Rep. */
const recording = (overrides: Parameters<typeof callBody>[1] = {}) =>
  callBody(1, { ...overrides, kind: 'recording', mediaType: 'audio/mpeg' })

const listOf = (...calls: ReturnType<typeof callBody>[]) =>
  route('GET', CALLS, json(200, page(calls)))

describe('Calls: the list', () => {
  test('lists Calls with the file name and deal id as text and the Deal linked by its opaque id', async () => {
    visit('/sales-history/calls', 'owner', [
      listOf(callBody(1, { dealId: '=HYPERLINK("x")', fileName: '<b>call.txt' })),
    ])
    const link = await screen.findByRole('link', { name: '=HYPERLINK("x")' })
    expect(link.getAttribute('href')).toBe(`/sales-history/deals/${hexId('deal', 1)}`)
    const row = link.closest('tr') as HTMLElement
    expect(row.querySelector('b')).toBeNull()
    expect(within(row).getByText('<b>call.txt')).toBeTruthy()
    expect(within(row).getByText('Ready')).toBeTruthy()
    expect(within(row).getByText('Sam')).toBeTruthy()
  })

  test('pages with the cursor, 25 at a time, and says when there are none', async () => {
    const portal = visit('/sales-history/calls', 'owner', [
      route('GET', CALLS, (call) =>
        param(call.url, 'cursor') === 'c2'
          ? json(200, page([callBody(2, { fileName: 'second.txt' })]))
          : json(200, page([callBody(1, { fileName: 'first.txt' })], 'c2'))
      ),
    ])
    await screen.findByText('first.txt')
    expect(param(portal.calls.find((call) => call.path === CALLS)?.url ?? '', 'limit')).toBe('25')
    await portal.user.click(screen.getByRole('button', { name: 'Load more Calls' }))
    expect(await screen.findByText('second.txt')).toBeTruthy()
  })

  test('an empty list says so', async () => {
    visit('/sales-history/calls', 'owner', [listOf()])
    expect(await screen.findByText(/no Calls/i)).toBeTruthy()
  })

  test('filters by state, asking the service', async () => {
    const portal = visit('/sales-history/calls', 'owner', [
      route('GET', CALLS, (call) =>
        json(200, page([callBody(1, { fileName: `${param(call.url, 'state') ?? 'any'}.txt` })]))
      ),
    ])
    await screen.findByText('any.txt')
    await portal.user.selectOptions(screen.getByLabelText('Show'), 'failed')
    expect(await screen.findByText('failed.txt')).toBeTruthy()
  })

  test('lists the Calls of one Deal by its opaque id, and ignores a malformed one', async () => {
    const deal = dealBody(3, { dealId: 'SECRET-DEAL' })
    const portal = visit(`/sales-history/calls?deal=${deal.id}`, 'owner', [
      route('GET', `${DEALS}/${deal.id}`, json(200, deal)),
      listOf(callBody(3)),
    ])
    expect(await screen.findByText(/Calls of Deal/)).toBeTruthy()
    expect(param(portal.calls.find((call) => call.path === CALLS)?.url ?? '', 'dealRecordId')).toBe(
      deal.id
    )
    expect(portal.calls.every((call) => !call.url.includes('SECRET'))).toBe(true)
  })

  test('a malformed deal in the address is dropped', async () => {
    const portal = visit('/sales-history/calls?deal=D-1', 'owner', [listOf(callBody(1))])
    await screen.findByText('call-1.txt')
    expect(param(portal.calls.find((call) => call.path === CALLS)?.url ?? '', 'dealRecordId')).toBe(
      null
    )
  })

  test('the Deal page links to its Calls by the opaque id', async () => {
    const deal = dealBody(1)
    visit(`/sales-history/deals/${deal.id}`, 'owner', [
      route('GET', `${DEALS}/${deal.id}`, json(200, deal)),
    ])
    const link = await screen.findByRole('link', { name: 'Calls of this Deal' })
    expect(link.getAttribute('href')).toContain(`deal=${deal.id}`)
  })
})

describe('Calls: a page with something this portal cannot read', () => {
  test('one Call in an unknown state is a placeholder with no actions and the others still show', async () => {
    visit('/sales-history/calls', 'owner', [
      route(
        'GET',
        CALLS,
        json(200, page([callBody(1), { ...callBody(2), state: 'quarantined' }, callBody(3)]))
      ),
      route('GET', RIGHTS, json(200, rightsBody())),
    ])
    expect(await screen.findByText('call-1.txt')).toBeTruthy()
    expect(screen.getByText('call-3.txt')).toBeTruthy()
    const placeholder = screen.getByText(/cannot be shown by this version of the portal/)
    const row = placeholder.closest('tr') as HTMLElement
    expect(within(row).queryAllByRole('button')).toHaveLength(0)
    expect(row.textContent).not.toContain('call-2.txt')
  })

  test.each([
    ['no items', { nextCursor: null }],
    ['an item with a bad id', page([{ ...callBody(1), id: 'nope' }])],
    ['items that are not a list', { items: 'x', nextCursor: null }],
  ])('%s fails the list as a whole', async (_name, body) => {
    visit('/sales-history/calls', 'owner', [
      route('GET', CALLS, json(200, body)),
      route('GET', RIGHTS, json(200, rightsBody())),
    ])
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0)
    expect(screen.queryByText('call-1.txt')).toBeNull()
  })
})

describe('Calls: in search, and why not', () => {
  test.each([
    [{ inSearch: true }, /In search/],
    [{ inSearch: false, dealOutcome: 'open' }, /Deal is still open/],
    [{ inSearch: false, dealOutcome: 'lost' }, /Deal was lost/],
    [{ inSearch: false, dealOutcome: 'won' }, /still being applied/],
    [{ inSearch: false, state: 'processing', dealOutcome: 'won' }, /still being processed/],
    [
      { inSearch: false, state: 'transcribing', dealOutcome: 'won', rep: null, speakerLabels: [] },
      /still being processed/,
    ],
    [{ inSearch: false, state: 'awaiting_rep', dealOutcome: 'won', rep: null }, /pick the Rep/],
    [
      { inSearch: false, state: 'failed', failureReason: 'no_turns', dealOutcome: 'won' },
      /Call failed/,
    ],
  ])('%j says %s', async (overrides, words) => {
    visit('/sales-history/calls', 'owner', [listOf(recording(overrides))])
    const row = (await screen.findByText('call-1.txt')).closest('tr') as HTMLElement
    expect(row.textContent).toMatch(words)
  })
})

describe('Calls: failures say what to do', () => {
  test.each(CALL_FAILURE_REASONS)(
    '%s is explained with the fix the contract names',
    async (reason) => {
      visit('/sales-history/calls', 'owner', [
        listOf(
          callBody(1, {
            state: 'failed',
            failureReason: reason,
            inSearch: false,
            speakerLabels: reason === 'too_many_speakers' ? [] : ['Sam', 'Pat'],
          })
        ),
      ])
      const row = (await screen.findByText('call-1.txt')).closest('tr') as HTMLElement
      const fix = {
        change_rep: /Pick a different Rep/,
        reupload: /Upload the same file again/,
        delete_and_upload: /Delete this Call and upload a corrected/,
      }[CALL_FAILURE_FIXES[reason]]
      expect(row.textContent).toMatch(fix)
    }
  )
})

describe('Calls: changing the Rep', () => {
  const REP = (id: string) => `${CALLS}/${id}/rep`

  test('offers only the speakers of the Call and sends the choice', async () => {
    const call = callBody(1)
    let rep = 'Sam'
    const portal = visit('/sales-history/calls', 'admin', [
      route('PUT', REP(call.id), (made) => {
        rep = (made.body as { rep: { label: string } }).rep.label
        return json(200, { ...call, state: 'processing', inSearch: false })
      }),
      route('GET', CALLS, () => json(200, page([{ ...call, rep: { by: 'speaker', label: rep } }]))),
    ])
    await portal.user.click(await screen.findByRole('button', { name: 'Change Rep of call-1.txt' }))
    const select = screen.getByLabelText('Rep for call-1.txt')
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['Choose a speaker', 'Sam', 'Pat'])
    await portal.user.selectOptions(select, 'Pat')
    await portal.user.click(screen.getByRole('button', { name: 'Save Rep' }))
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Notice' }).textContent).toMatch(/out of search/)
    )
    expect(portal.calls.find((made) => made.method === 'PUT')?.body).toEqual({
      rep: { by: 'speaker', label: 'Pat' },
    })
  })

  test.each(['processing', 'transcribing', 'uploaded'])(
    'is disabled, with the reason, while the Call is %s',
    async (state) => {
      const portal = visit('/sales-history/calls', 'owner', [
        listOf(
          recording({
            state,
            inSearch: false,
            ...(state === 'transcribing' ? { rep: null, speakerLabels: [] } : {}),
          })
        ),
      ])
      const button = await screen.findByRole('button', { name: 'Change Rep of call-1.txt' })
      expect(button.getAttribute('aria-disabled')).toBe('true')
      expect(button.getAttribute('aria-describedby')).toBeTruthy()
      await portal.user.click(button)
      expect(screen.queryByLabelText('Rep for call-1.txt')).toBeNull()
    }
  )

  test('is allowed for a Call that failed because of the Rep, not for one that failed otherwise', async () => {
    visit('/sales-history/calls', 'owner', [
      listOf(
        callBody(1, { state: 'failed', failureReason: 'rep_label_not_found', inSearch: false }),
        callBody(2, { state: 'failed', failureReason: 'no_turns', inSearch: false })
      ),
    ])
    expect(
      (await screen.findByRole('button', { name: 'Change Rep of call-1.txt' })).getAttribute(
        'aria-disabled'
      )
    ).not.toBe('true')
    expect(
      screen.getByRole('button', { name: 'Change Rep of call-2.txt' }).getAttribute('aria-disabled')
    ).toBe('true')
  })

  test('an open form goes away when the Call moves to a state that refuses a change, and nothing is sent', async () => {
    const call = callBody(1)
    let moved = false
    const portal = visit('/sales-history/calls', 'owner', [
      route('GET', RIGHTS, json(200, rightsBody())),
      route('GET', CALLS, () =>
        json(200, page([moved ? { ...call, state: 'processing', inSearch: false } : call]))
      ),
    ])
    await portal.user.click(await screen.findByRole('button', { name: 'Change Rep of call-1.txt' }))
    expect(screen.getByRole('button', { name: 'Save Rep' })).toBeTruthy()
    moved = true
    void portal.app.queryClient.invalidateQueries()
    await waitFor(() => {
      if (screen.queryByRole('button', { name: 'Save Rep' }) !== null) {
        throw new Error('the Save Rep form is still open')
      }
    })
    expect(portal.calls.filter((made) => made.method === 'PUT')).toHaveLength(0)
  })

  test('opening the form on a Call whose Rep is the second speaker and saving untouched sends nothing', async () => {
    const call = callBody(1, {
      rep: { by: 'speaker', label: 'Pat' },
      speakerLabels: ['Sam', 'Pat'],
    })
    const portal = visit('/sales-history/calls', 'owner', [
      route('GET', RIGHTS, json(200, rightsBody())),
      listOf(call),
    ])
    await portal.user.click(await screen.findByRole('button', { name: 'Change Rep of call-1.txt' }))
    expect((screen.getByLabelText('Rep for call-1.txt') as HTMLSelectElement).value).toBe('Pat')
    await portal.user.click(screen.getByRole('button', { name: 'Save Rep' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/already the Rep/)
    expect(portal.calls.filter((made) => made.method === 'PUT')).toHaveLength(0)
  })

  test('a Call waiting for a Rep starts with no choice and saving without one sends nothing', async () => {
    const portal = visit('/sales-history/calls', 'owner', [
      route('GET', RIGHTS, json(200, rightsBody())),
      listOf(recording({ state: 'awaiting_rep', rep: null, inSearch: false })),
    ])
    await portal.user.click(await screen.findByRole('button', { name: 'Change Rep of call-1.txt' }))
    const select = screen.getByLabelText('Rep for call-1.txt') as HTMLSelectElement
    expect(select.value).toBe('')
    expect(within(select).getAllByRole('option')[0]?.textContent).toBe('Choose a speaker')
    await portal.user.click(screen.getByRole('button', { name: 'Save Rep' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Choose a speaker/)
    expect(portal.calls.filter((made) => made.method === 'PUT')).toHaveLength(0)
  })

  test('a choice whose speaker is no longer in the Call is not sent', async () => {
    let labels = ['Sam', 'Pat', 'Lee']
    const portal = visit('/sales-history/calls', 'owner', [
      route('GET', RIGHTS, json(200, rightsBody())),
      route('GET', CALLS, () =>
        json(
          200,
          page([callBody(1, { rep: { by: 'speaker', label: 'Sam' }, speakerLabels: labels })])
        )
      ),
    ])
    await portal.user.click(await screen.findByRole('button', { name: 'Change Rep of call-1.txt' }))
    await portal.user.selectOptions(screen.getByLabelText('Rep for call-1.txt'), 'Lee')
    labels = ['Sam', 'Pat']
    void portal.app.queryClient.invalidateQueries()
    await waitFor(() => {
      const options = within(screen.getByLabelText('Rep for call-1.txt'))
        .getAllByRole('option')
        .map((option) => option.textContent)
      if (options.includes('Lee')) {
        throw new Error('the list still has the old speakers')
      }
    })
    await portal.user.click(screen.getByRole('button', { name: 'Save Rep' }))
    expect(portal.calls.filter((made) => made.method === 'PUT')).toHaveLength(0)
  })

  test('a refusal from the service is explained', async () => {
    const call = callBody(1)
    const portal = visit('/sales-history/calls', 'owner', [
      route(
        'PUT',
        REP(call.id),
        failure(409, SALES_HISTORY_ERRORS['call.rep_not_changeable'].code)
      ),
      listOf(call),
    ])
    await portal.user.click(await screen.findByRole('button', { name: 'Change Rep of call-1.txt' }))
    await portal.user.selectOptions(screen.getByLabelText('Rep for call-1.txt'), 'Pat')
    await portal.user.click(screen.getByRole('button', { name: 'Save Rep' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/cannot be changed now/)
  })
})

describe('Calls: delete and restore', () => {
  test('deleting asks first, then says until when it can be restored', async () => {
    const call = callBody(1)
    let gone = false
    const portal = visit('/sales-history/calls', 'owner', [
      route('DELETE', `${CALLS}/${call.id}`, () => {
        gone = true
        return json(200, {
          ...call,
          inSearch: false,
          state: 'deleted',
          deletedAt: '2026-10-13T10:00:00Z',
          purgeAt: '2026-11-12T10:00:00Z',
        })
      }),
      route('GET', CALLS, () => json(200, page(gone ? [] : [call]))),
    ])
    await portal.user.click(await screen.findByRole('button', { name: 'Delete call-1.txt' }))
    expect(portal.calls.filter((made) => made.method === 'DELETE')).toHaveLength(0)
    await portal.user.click(screen.getByRole('button', { name: 'Delete Call' }))
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Notice' }).textContent).toMatch(/restore it until/)
    )
  })

  test('a deleted Call can be restored, and a purged one is explained', async () => {
    const call = callBody(1, {
      state: 'deleted',
      inSearch: false,
      deletedAt: '2026-10-13T10:00:00Z',
      purgeAt: '2026-11-12T10:00:00Z',
    })
    const portal = visit('/sales-history/calls', 'owner', [
      route(
        'POST',
        `${CALLS}/${call.id}/restore`,
        failure(410, SALES_HISTORY_ERRORS['call.not_restorable'].code)
      ),
      listOf(call),
    ])
    await portal.user.selectOptions(await screen.findByLabelText('Show'), 'deleted')
    await portal.user.click(await screen.findByRole('button', { name: 'Restore call-1.txt' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/purged/)
  })

  test('restoring says it is processed again', async () => {
    const call = callBody(1, {
      state: 'deleted',
      inSearch: false,
      purgeAt: '2026-11-12T10:00:00Z',
      deletedAt: '2026-10-13T10:00:00Z',
    })
    const portal = visit('/sales-history/calls', 'owner', [
      route(
        'POST',
        `${CALLS}/${call.id}/restore`,
        json(200, { ...call, state: 'processing', deletedAt: null, purgeAt: null })
      ),
      listOf(call),
    ])
    await portal.user.click(await screen.findByRole('button', { name: 'Restore call-1.txt' }))
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Notice' }).textContent).toMatch(/processed again/)
    )
  })
})

describe('Calls: polling', () => {
  test('a Call on its way is asked about again no sooner than three seconds, and not once it is ready', async () => {
    const gate = gatedSleep()
    let reads = 0
    visit(
      '/sales-history/calls',
      'owner',
      [
        route('GET', RIGHTS, json(200, rightsBody())),
        route('GET', CALLS, () => {
          reads += 1
          return json(
            200,
            page([callBody(1, reads >= 2 ? {} : { state: 'processing', inSearch: false })])
          )
        }),
      ],
      { sleep: gate.sleep }
    )
    await screen.findByText('Processing')
    await waitFor(() => expect(gate.waits).toHaveLength(1))
    expect(gate.waits[0]).toBeGreaterThanOrEqual(3_000)
    gate.release()
    await screen.findByText('Ready')
    gate.release()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(reads).toBe(2)
  })

  test('a Call waiting for a person is not polled', async () => {
    const gate = gatedSleep()
    visit(
      '/sales-history/calls',
      'owner',
      [
        route('GET', RIGHTS, json(200, rightsBody())),
        listOf(recording({ state: 'awaiting_rep', rep: null, inSearch: false })),
      ],
      { sleep: gate.sleep }
    )
    await screen.findByText('call-1.txt')
    expect(gate.waits).toHaveLength(0)
  })
})

describe('Calls: uploading a Transcript', () => {
  const transcript = (name = 'call.txt', text = 'Sam: hi\nPat: hello') =>
    new File([text], name, { type: 'text/plain' })
  const status = () => screen.getByRole('status', { name: 'Call upload' })
  const posts = (portal: ReturnType<typeof visit>) =>
    portal.calls.filter((made) => made.method === 'POST' && made.path === CALLS)
  const confirmed = route('GET', RIGHTS, json(200, rightsBody()))
  const ready = async (portal: ReturnType<typeof visit>, file = transcript()) => {
    await screen.findByLabelText(/choose a transcript/i)
    fireEvent.change(screen.getByLabelText(/choose a transcript/i), { target: { files: [file] } })
    await portal.user.type(screen.getByLabelText("Customer's deal id"), '=DEAL-9')
    await portal.user.type(screen.getByLabelText("Rep's speaker label"), 'Sam')
  }

  test('the limits are shown before anything is chosen, and there is no Recording upload', async () => {
    visit('/sales-history/calls', 'owner', [listOf(), confirmed])
    const hint = await screen.findByText(/5 MB/)
    expect(hint.textContent).toMatch(/\.txt, \.vtt, \.srt, \.json/)
    const input = screen.getByLabelText(/choose a transcript/i)
    expect(input.getAttribute('accept')).toBe('.txt,.vtt,.srt,.json')
  })

  test('sends the file, the deal id and the Rep in the body, with an idempotency key and never in the address', async () => {
    const portal = visit('/sales-history/calls', 'owner', [
      route('POST', CALLS, json(201, callBody(5, { state: 'uploaded', inSearch: false }))),
      listOf(),
      confirmed,
    ])
    await ready(portal)
    await portal.user.click(screen.getByRole('button', { name: 'Upload Transcript' }))
    await waitFor(() => expect(status().textContent).toMatch(/Uploaded call\.txt/))
    const made = posts(portal)[0]
    const form = made?.init.body as FormData
    expect(form instanceof FormData).toBe(true)
    expect((form.get('file') as File).name).toBe('call.txt')
    expect(form.get('dealId')).toBe('=DEAL-9')
    expect(JSON.parse(String(form.get('rep')))).toEqual({ by: 'speaker', label: 'Sam' })
    expect(made?.headers.get(IDEMPOTENCY)).toMatch(/^portal-/)
    expect(portal.calls.every((call) => !call.url.includes('DEAL-9'))).toBe(true)
  })

  test('200 says nothing new was stored', async () => {
    const portal = visit('/sales-history/calls', 'owner', [
      route('POST', CALLS, json(200, callBody(5))),
      listOf(),
      confirmed,
    ])
    await ready(portal)
    await portal.user.click(screen.getByRole('button', { name: 'Upload Transcript' }))
    await waitFor(() => expect(status().textContent).toMatch(/already uploaded/))
  })

  test.each([
    ['song.mp3', /Recordings/],
    ['notes.pdf', /Transcript/],
  ])('%s is stopped in the browser', async (name, words) => {
    const portal = visit('/sales-history/calls', 'owner', [listOf(), confirmed])
    await screen.findByLabelText(/choose a transcript/i)
    fireEvent.change(screen.getByLabelText(/choose a transcript/i), {
      target: { files: [transcript(name)] },
    })
    await portal.user.click(screen.getByRole('button', { name: 'Upload Transcript' }))
    expect((await screen.findAllByText(words)).length).toBeGreaterThan(0)
    expect(posts(portal)).toHaveLength(0)
  })

  test('a Transcript over the limit is stopped with the limit named', async () => {
    const portal = visit('/sales-history/calls', 'owner', [listOf(), confirmed])
    const big = transcript()
    Object.defineProperty(big, 'size', { value: 5 * 1024 * 1024 + 1 })
    await screen.findByLabelText(/choose a transcript/i)
    fireEvent.change(screen.getByLabelText(/choose a transcript/i), { target: { files: [big] } })
    await portal.user.click(screen.getByRole('button', { name: 'Upload Transcript' }))
    expect((await screen.findAllByText(/larger than 5 MB/)).length).toBeGreaterThan(0)
    expect(posts(portal)).toHaveLength(0)
  })

  test('missing fields are explained next to them and focus goes to the first', async () => {
    const portal = visit('/sales-history/calls', 'owner', [listOf(), confirmed])
    await screen.findByLabelText(/choose a transcript/i)
    await portal.user.click(screen.getByRole('button', { name: 'Upload Transcript' }))
    const file = screen.getByLabelText(/choose a transcript/i)
    expect(file.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(file)
    expect(screen.getByLabelText("Customer's deal id").getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText("Rep's speaker label").getAttribute('aria-invalid')).toBe('true')
    expect(posts(portal)).toHaveLength(0)
  })

  test.each([
    [409, SALES_HISTORY_ERRORS['call.content_in_other_deal'].code, /another deal id/],
    [413, SALES_HISTORY_ERRORS['call.too_large'].code, /larger than 5 MB/],
    [415, SALES_HISTORY_ERRORS['call.unsupported_type'].code, /not supported/],
    [422, SALES_HISTORY_ERRORS['call.rep_invalid'].code, /speaker/],
    [403, SALES_HISTORY_ERRORS['call.quota_exceeded'].code, /limit/],
    [403, ERRORS['auth.forbidden'].code, /role does not allow/],
  ] as const)('%s %s is explained', async (code, name, words) => {
    const portal = visit('/sales-history/calls', 'owner', [
      route('POST', CALLS, failure(code, name)),
      listOf(),
      confirmed,
    ])
    await ready(portal)
    await portal.user.click(screen.getByRole('button', { name: 'Upload Transcript' }))
    await waitFor(() => expect(status().textContent).toMatch(words))
  })

  test('a retry after an unknown outcome reuses the same idempotency key', async () => {
    let attempts = 0
    const portal = visit('/sales-history/calls', 'owner', [
      route('POST', CALLS, () => {
        attempts += 1
        return attempts === 1
          ? failure(503, ERRORS['server.unavailable'].code)
          : json(201, callBody(5))
      }),
      listOf(),
      confirmed,
    ])
    await ready(portal)
    await portal.user.click(screen.getByRole('button', { name: 'Upload Transcript' }))
    await portal.user.click(await screen.findByRole('button', { name: 'Retry call.txt' }))
    await waitFor(() => expect(status().textContent).toMatch(/Uploaded call\.txt/))
    const [first, second] = posts(portal)
    expect(first?.headers.get(IDEMPOTENCY)).toBe(second?.headers.get(IDEMPOTENCY))
  })
})

describe('Calls: the rights confirmation comes first', () => {
  const transcript = () => new File(['Sam: hi'], 'call.txt', { type: 'text/plain' })

  async function fill(portal: ReturnType<typeof visit>) {
    await screen.findByLabelText(/choose a transcript/i)
    fireEvent.change(screen.getByLabelText(/choose a transcript/i), {
      target: { files: [transcript()] },
    })
    await portal.user.type(screen.getByLabelText("Customer's deal id"), 'D-77')
    await portal.user.type(screen.getByLabelText("Rep's speaker label"), 'Sam')
    await portal.user.click(screen.getByRole('button', { name: 'Upload Transcript' }))
  }

  test('with no confirmation nothing is sent, the rights page opens, and the file and fields are still there on return', async () => {
    let confirmed = false
    const portal = visit('/sales-history/calls', 'owner', [
      route('PUT', RIGHTS, () => {
        confirmed = true
        return json(200, rightsBody())
      }),
      route('GET', RIGHTS, () => json(200, rightsBody({ confirmedVersion: confirmed ? 1 : null }))),
      route('POST', CALLS, json(201, callBody(5))),
      listOf(),
    ])
    await screen.findByLabelText(/choose a transcript/i)
    await waitFor(() => expect(portal.calls.some((made) => made.path === RIGHTS)).toBe(true))
    // wait for the status to be known before submitting
    await waitFor(() =>
      expect(portal.app.queryClient.getQueryData(['org_1', 'rights'])).toBeDefined()
    )
    await fill(portal)
    await screen.findByRole('heading', { name: 'Rights confirmation' })
    expect(
      portal.calls.filter((made) => made.method === 'POST' && made.path === CALLS)
    ).toHaveLength(0)
    await portal.user.click(
      await screen.findByRole('checkbox', { name: /I confirm that I am authorised/ })
    )
    await portal.user.click(screen.getByRole('button', { name: 'Confirm' }))
    await screen.findByRole('heading', { name: 'Calls' })
    expect(screen.getByText(/call\.txt is ready/)).toBeTruthy()
    expect((screen.getByLabelText("Customer's deal id") as HTMLInputElement).value).toBe('D-77')
    expect((screen.getByLabelText("Rep's speaker label") as HTMLInputElement).value).toBe('Sam')
    await portal.user.click(screen.getByRole('button', { name: 'Upload Transcript' }))
    await waitFor(() =>
      expect(
        portal.calls.filter((made) => made.method === 'POST' && made.path === CALLS)
      ).toHaveLength(1)
    )
    expect(portal.router.state.location.href).not.toContain('D-77')
  })

  test('the service saying a confirmation is needed does the same', async () => {
    const portal = visit('/sales-history/calls', 'owner', [
      route(
        'POST',
        CALLS,
        failure(403, SALES_HISTORY_ERRORS['rights.confirmation_required'].code, {
          wordingVersion: 1,
        })
      ),
      route('GET', RIGHTS, json(200, rightsBody({ confirmedVersion: null }))),
      listOf(),
    ])
    await fill(portal)
    await screen.findByRole('heading', { name: 'Rights confirmation' })
  })

  test('the held file is dropped when the Organization is not the one it was chosen in', async () => {
    const { createPendingCall } = await import('~/data/pending-call')
    const holder = createPendingCall()
    holder.hold({ organizationId: 'org_1', file: transcript(), dealId: 'D-1', repLabel: 'Sam' })
    expect(holder.take('org_2')).toBeNull()
    expect(holder.take('org_1')).toBeNull()
    holder.hold({ organizationId: 'org_1', file: transcript(), dealId: 'D-1', repLabel: 'Sam' })
    expect(holder.take('org_1')?.dealId).toBe('D-1')
    expect(holder.take('org_1')).toBeNull()
  })
})

describe('Calls: the held Transcript is used once', () => {
  const transcript = () => new File(['Sam: hi'], 'held.txt', { type: 'text/plain' })

  test('after the return trip, leaving and coming back shows an empty form', async () => {
    const portal = visit('/sales-history/deals', 'owner', [
      route('GET', RIGHTS, json(200, rightsBody())),
      route('GET', DEALS, json(200, page([]))),
      listOf(),
    ])
    portal.app.pendingCall.hold({
      organizationId: 'org_1',
      file: transcript(),
      dealId: 'D-77',
      repLabel: 'Sam',
    })
    await portal.user.click(await screen.findByRole('link', { name: 'Calls' }))
    expect(((await screen.findByLabelText("Customer's deal id")) as HTMLInputElement).value).toBe(
      'D-77'
    )
    await portal.user.click(screen.getByRole('link', { name: 'Deals' }))
    await screen.findByRole('heading', { name: 'Deals' })
    await portal.user.click(screen.getByRole('link', { name: 'Calls' }))
    expect(((await screen.findByLabelText("Customer's deal id")) as HTMLInputElement).value).toBe(
      ''
    )
    expect(screen.queryByText(/held\.txt is ready/)).toBeNull()
  })

  test('under StrictMode the form is filled once and is empty on the next visit', async () => {
    const { renderPortal } = await import('~/testing/render')
    const portal = renderPortal({
      url: '/sales-history/deals',
      signedIn: tokens({ organization: { id: 'org_1', role: 'owner' } }),
      strict: true,
      handlers: [
        route('GET', RIGHTS, json(200, rightsBody())),
        route('GET', DEALS, json(200, page([]))),
        listOf(),
      ],
    })
    portal.app.pendingCall.hold({
      organizationId: 'org_1',
      file: transcript(),
      dealId: 'D-77',
      repLabel: 'Sam',
    })
    await portal.user.click(await screen.findByRole('link', { name: 'Calls' }))
    expect(((await screen.findByLabelText("Customer's deal id")) as HTMLInputElement).value).toBe(
      'D-77'
    )
    await portal.user.click(screen.getByRole('link', { name: 'Deals' }))
    await screen.findByRole('heading', { name: 'Deals' })
    await portal.user.click(screen.getByRole('link', { name: 'Calls' }))
    expect(((await screen.findByLabelText("Customer's deal id")) as HTMLInputElement).value).toBe(
      ''
    )
  })

  test('another Organization never sees it, and nothing is sent', async () => {
    const portal = visit('/sales-history/deals', 'owner', [
      route('GET', RIGHTS, json(200, rightsBody())),
      route('GET', DEALS, json(200, page([]))),
      route('POST', '/v1/client/sessions/refresh', () =>
        json(200, tokens({ accessToken: 'access-2', organization: { id: 'org_2', role: 'owner' } }))
      ),
      listOf(),
    ])
    await screen.findByRole('heading', { name: 'Deals' })
    portal.app.pendingCall.hold({
      organizationId: 'org_1',
      file: transcript(),
      dealId: 'D-77',
      repLabel: 'Sam',
    })
    await act(() => portal.app.session.refresh('access-1'))
    expect(portal.app.pendingCall.peek('org_2')).toBeNull()
    await act(() => portal.router.navigate({ to: '/sales-history/calls' }))
    expect(((await screen.findByLabelText("Customer's deal id")) as HTMLInputElement).value).toBe(
      ''
    )
    expect(
      portal.calls.filter((made) => made.method === 'POST' && made.path === CALLS)
    ).toHaveLength(0)
  })

  test('sign-out drops it', async () => {
    const portal = visit('/sales-history/deals', 'owner', [
      route('GET', RIGHTS, json(200, rightsBody())),
      route('GET', DEALS, json(200, page([]))),
      route('POST', '/v1/client/sessions/sign-out', json(204)),
    ])
    await screen.findByRole('heading', { name: 'Deals' })
    portal.app.pendingCall.hold({
      organizationId: 'org_1',
      file: transcript(),
      dealId: 'D-77',
      repLabel: 'Sam',
    })
    await act(() => portal.app.session.signOut())
    expect(portal.app.pendingCall.peek('org_1')).toBeNull()
  })
})
