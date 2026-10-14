import { afterEach, describe, expect, test } from 'bun:test'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ERRORS, SALES_HISTORY_ERRORS } from 'tula-closeline-contract'
import { createApp } from '~/app'
import { AppContext } from '~/app-context'
import { RIGHTS_WORDING, type RightsWording } from '~/data/rights-wording'
import { createReporter } from '~/report/reporter'
import { SalesLayout } from '~/screens/sales/SalesLayout'
import { dealBody, hexId, importBody, page, rightsBody, rowBody } from '~/testing/core-bodies'
import { failure, fakeFetch, type Handler, json, route, TEST_ENV, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const PB = '/v1/playbook'
const DEALS = `${PB}/deals`
const IMPORTS = `${PB}/deal-imports`
const RIGHTS = `${PB}/rights-confirmation`
const IDEMPOTENCY = 'idempotency-key'
type Role = 'owner' | 'admin' | 'manager' | 'rep'

function visit(
  url: string,
  role: Role,
  handlers: Handler[],
  extra: { sleep?: (milliseconds: number) => Promise<void> } = {}
) {
  return renderPortal({
    url,
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers,
    ...(extra.sleep ? { sleep: extra.sleep } : {}),
  })
}

/** A wait the test controls: every call is recorded and stays pending until `release` is called. */
function gatedSleep() {
  const waits: number[] = []
  const gates: (() => void)[] = []
  return {
    waits,
    sleep: (milliseconds: number) =>
      new Promise<void>((resolve) => {
        waits.push(milliseconds)
        gates.push(resolve)
      }),
    release: () => gates.shift()?.(),
  }
}

const param = (url: string, name: string) => new URL(url, 'http://x').searchParams.get(name)
const salesCalls = (portal: ReturnType<typeof visit>) =>
  portal.calls.filter((call) => call.path.startsWith(PB))

describe('Sales history: Owner and Admin only', () => {
  const urls = [
    '/sales-history',
    '/sales-history/deals',
    `/sales-history/deals/${hexId('deal', 1)}`,
    '/sales-history/imports',
    `/sales-history/imports/${hexId('dimp', 1)}`,
    '/sales-history/rights',
  ]

  test.each(
    (['manager', 'rep'] as const).flatMap((role) => urls.map((url) => [role, url] as const))
  )('a %s who opens %s gets the forbidden screen and nothing is requested', async (role, url) => {
    const portal = visit(url, role, [])
    expect((await screen.findByRole('heading', { name: 'Not allowed' })).textContent).toBeTruthy()
    expect(screen.getByText(/Ask an Owner or Admin/)).toBeTruthy()
    expect(salesCalls(portal)).toHaveLength(0)
  })

  test.each([['manager'], ['rep']] as const)('a %s has no Sales history link', async (role) => {
    visit('/', role, [])
    await screen.findByRole('navigation', { name: 'Main' })
    expect(screen.queryByRole('link', { name: 'Sales history' })).toBeNull()
  })

  test.each([['owner'], ['admin']] as const)(
    'an %s has the link and the section menu',
    async (role) => {
      visit('/sales-history', role, [route('GET', RIGHTS, json(200, rightsBody()))])
      expect(await screen.findByRole('link', { name: 'Sales history' })).toBeTruthy()
      const menu = screen.getByRole('navigation', { name: 'Sales history' })
      expect(
        within(menu)
          .getAllByRole('link')
          .map((link) => link.textContent)
      ).toEqual(['Overview', 'Deals', 'Imports', 'Rights confirmation'])
    }
  )
})

describe('Sales history: the rights confirmation', () => {
  test('before the first confirmation it shows the wording and its version, and asks for a tick', async () => {
    const portal = visit('/sales-history/rights', 'owner', [
      route('GET', RIGHTS, json(200, rightsBody({ confirmedVersion: null }))),
    ])
    expect(
      await screen.findByRole('heading', { name: 'Confirm your right to share Calls' })
    ).toBeTruthy()
    expect(screen.getByText(/Wording version 1/)).toBeTruthy()
    const box = screen.getByRole('checkbox', { name: /I confirm that I am authorised/ })
    await portal.user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(box.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(box)
    expect(screen.getByText(/Tick the box/)).toBeTruthy()
    expect(portal.calls.filter((call) => call.method === 'PUT')).toHaveLength(0)
  })

  test('the wording is marked as a draft pending legal review while it is one', async () => {
    visit('/sales-history/rights', 'owner', [
      route('GET', RIGHTS, json(200, rightsBody({ confirmedVersion: null }))),
    ])
    expect(
      (await screen.findByText(/Draft wording, pending legal review/)).textContent
    ).toBeTruthy()
  })

  test('ticking and confirming sends the version that was shown, then says it is recorded', async () => {
    let confirmed = false
    const portal = visit('/sales-history/rights', 'admin', [
      route('PUT', RIGHTS, () => {
        confirmed = true
        return json(200, rightsBody())
      }),
      route('GET', RIGHTS, () => json(200, rightsBody({ confirmedVersion: confirmed ? 1 : null }))),
    ])
    await portal.user.click(
      await screen.findByRole('checkbox', { name: /I confirm that I am authorised/ })
    )
    await portal.user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Notice' }).textContent).toContain('recorded')
    )
    const put = portal.calls.find((call) => call.method === 'PUT')
    expect(put?.body).toEqual({ wordingVersion: 1 })
  })

  test('after confirming it goes back to where the person came from, if that is a page of this section', async () => {
    let confirmed = false
    const portal = visit('/sales-history/rights?from=/sales-history/imports', 'owner', [
      route('PUT', RIGHTS, () => {
        confirmed = true
        return json(200, rightsBody())
      }),
      route('GET', RIGHTS, () => json(200, rightsBody({ confirmedVersion: confirmed ? 1 : null }))),
      route('GET', IMPORTS, json(200, page([]))),
    ])
    await portal.user.click(
      await screen.findByRole('checkbox', { name: /I confirm that I am authorised/ })
    )
    await portal.user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByRole('heading', { name: 'Deal imports' })).toBeTruthy()
  })

  test('a "from" that is not a page of this section is ignored', async () => {
    let confirmed = false
    const portal = visit('/sales-history/rights?from=https%3A%2F%2Fevil.example%2F', 'owner', [
      route('PUT', RIGHTS, () => {
        confirmed = true
        return json(200, rightsBody())
      }),
      route('GET', RIGHTS, () => json(200, rightsBody({ confirmedVersion: confirmed ? 1 : null }))),
    ])
    await portal.user.click(
      await screen.findByRole('checkbox', { name: /I confirm that I am authorised/ })
    )
    await portal.user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Notice' }).textContent).toContain('recorded')
    )
    expect(screen.getByRole('heading', { name: 'Rights confirmation' })).toBeTruthy()
  })

  test('a changed wording asks again and says which version was confirmed before', async () => {
    visit('/sales-history/rights', 'owner', [
      route(
        'GET',
        RIGHTS,
        json(200, rightsBody({ currentWordingVersion: 1, confirmedVersion: null }))
      ),
    ])
    await screen.findByRole('checkbox', { name: /I confirm that I am authorised/ })
  })

  test('a wording version this build has no text for cannot be confirmed from here', async () => {
    visit('/sales-history/rights', 'owner', [
      route(
        'GET',
        RIGHTS,
        json(200, rightsBody({ currentWordingVersion: 99, confirmedVersion: 1 }))
      ),
    ])
    expect((await screen.findByRole('alert')).textContent).toContain('newer wording')
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
  })

  test('rights.version_outdated is explained', async () => {
    const portal = visit('/sales-history/rights', 'owner', [
      route('PUT', RIGHTS, failure(409, SALES_HISTORY_ERRORS['rights.version_outdated'].code)),
      route('GET', RIGHTS, json(200, rightsBody({ confirmedVersion: null }))),
    ])
    await portal.user.click(
      await screen.findByRole('checkbox', { name: /I confirm that I am authorised/ })
    )
    await portal.user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect((await screen.findByRole('alert')).textContent).toContain('wording has changed')
  })

  test('the overview says whether the Organization has confirmed', async () => {
    visit('/sales-history', 'owner', [route('GET', RIGHTS, json(200, rightsBody()))])
    expect((await screen.findByText(/Rights confirmed/)).textContent).toContain('version 1')
  })

  test('the overview links to the confirmation when there is none', async () => {
    visit('/sales-history', 'owner', [
      route('GET', RIGHTS, json(200, rightsBody({ confirmedVersion: null }))),
    ])
    expect(await screen.findByText(/not been confirmed/i)).toBeTruthy()
  })
})

describe('Sales history: Deals', () => {
  test('lists Deals with the customer deal id as text and a link by the opaque id', async () => {
    visit('/sales-history/deals', 'owner', [
      route(
        'GET',
        DEALS,
        json(
          200,
          page([
            dealBody(1, {
              dealId: 'D-100',
              name: 'Acme renewal',
              outcome: 'won',
              closedAt: '2026-01-31T00:00:00Z',
              amount: '12000.00',
              currency: 'EUR',
              callCount: 2,
            }),
          ])
        )
      ),
    ])
    const link = await screen.findByRole('link', { name: 'D-100' })
    expect(link.getAttribute('href')).toBe(`/sales-history/deals/${hexId('deal', 1)}`)
    const row = link.closest('tr') as HTMLElement
    expect(within(row).getByText('Acme renewal')).toBeTruthy()
    expect(within(row).getByText('Won')).toBeTruthy()
    expect(within(row).getByText(/12,000/)).toBeTruthy()
    expect(within(row).getByText('EUR', { exact: false })).toBeTruthy()
  })

  test.each(['=HYPERLINK("http://evil.example","x")', '+1+1', '-2+3', '@SUM(A1)'])(
    'a deal id that begins like a formula (%s) is shown as plain text, never in an address',
    async (dealId) => {
      const portal = visit('/sales-history/deals', 'owner', [
        route('GET', DEALS, json(200, page([dealBody(1, { dealId })]))),
      ])
      const link = await screen.findByRole('link', { name: dealId })
      expect(link.textContent).toBe(dealId)
      expect(link.getAttribute('href')).not.toContain(encodeURIComponent(dealId))
      expect(link.getAttribute('href')).not.toContain(dealId)
      expect(portal.calls.every((call) => !call.url.includes(encodeURIComponent(dealId)))).toBe(
        true
      )
    }
  )

  test('markup in a deal id or name is inert text', async () => {
    visit('/sales-history/deals', 'owner', [
      route(
        'GET',
        DEALS,
        json(
          200,
          page([dealBody(1, { dealId: '<img src=x onerror=alert(1)>', name: '<b>bold</b>' })])
        )
      ),
    ])
    const row = (await screen.findByRole('link', { name: '<img src=x onerror=alert(1)>' })).closest(
      'tr'
    ) as HTMLElement
    expect(row.querySelector('img')).toBeNull()
    expect(row.querySelector('b')).toBeNull()
    expect(within(row).getByText('<b>bold</b>')).toBeTruthy()
  })

  test('filters by Outcome and by "no CSV has named it", asking the service each time', async () => {
    const portal = visit('/sales-history/deals', 'owner', [
      route('GET', DEALS, (call) =>
        json(
          200,
          page([
            dealBody(param(call.url, 'outcome') === 'won' ? 2 : 1, {
              dealId: param(call.url, 'outcome') === 'won' ? 'WON-1' : 'ANY-1',
            }),
          ])
        )
      ),
    ])
    await screen.findByRole('link', { name: 'ANY-1' })
    await portal.user.selectOptions(screen.getByLabelText('Outcome'), 'won')
    await screen.findByRole('link', { name: 'WON-1' })
    await portal.user.click(screen.getByRole('checkbox', { name: /no CSV has named/i }))
    await waitFor(() =>
      expect(portal.calls.some((call) => param(call.url, 'appearedInImport') === 'false')).toBe(
        true
      )
    )
  })

  test('pages with the cursor, 25 at a time', async () => {
    const portal = visit('/sales-history/deals', 'owner', [
      route('GET', DEALS, (call) =>
        param(call.url, 'cursor') === 'c2'
          ? json(200, page([dealBody(2, { dealId: 'SECOND' })]))
          : json(200, page([dealBody(1, { dealId: 'FIRST' })], 'c2'))
      ),
    ])
    await screen.findByRole('link', { name: 'FIRST' })
    expect(param(portal.calls.find((call) => call.path === DEALS)?.url ?? '', 'limit')).toBe('25')
    await portal.user.click(screen.getByRole('button', { name: 'Load more Deals' }))
    await screen.findByRole('link', { name: 'SECOND' })
  })

  test('says so when there are no Deals, and when the list cannot be read', async () => {
    visit('/sales-history/deals', 'owner', [route('GET', DEALS, json(200, page([])))])
    expect(await screen.findByText(/no Deals/i)).toBeTruthy()
  })

  test('looking a Deal up sends the customer deal id in the body only, then opens it by its opaque id', async () => {
    const found = dealBody(7, { dealId: '=SECRET-1', outcome: 'lost' })
    const portal = visit('/sales-history/deals', 'admin', [
      route('POST', `${DEALS}/lookup`, json(200, found)),
      route('GET', `${DEALS}/${found.id}`, json(200, found)),
      route('GET', DEALS, json(200, page([]))),
    ])
    await portal.user.type(await screen.findByLabelText("Customer's deal id"), '=SECRET-1')
    await portal.user.click(screen.getByRole('button', { name: 'Find Deal' }))
    expect(await screen.findByRole('heading', { name: 'Deal' })).toBeTruthy()
    const lookup = portal.calls.find((call) => call.path === `${DEALS}/lookup`)
    expect(lookup?.method).toBe('POST')
    expect(lookup?.body).toEqual({ dealId: '=SECRET-1' })
    expect(portal.calls.every((call) => !call.url.includes('SECRET'))).toBe(true)
    expect(portal.router.state.location.pathname).toBe(`/sales-history/deals/${found.id}`)
    expect(portal.router.state.location.href).not.toContain('SECRET')
  })

  test('a deal id nobody has is explained next to the field, and an empty one sends nothing', async () => {
    const portal = visit('/sales-history/deals', 'owner', [
      route('POST', `${DEALS}/lookup`, failure(404, SALES_HISTORY_ERRORS['deal.not_found'].code)),
      route('GET', DEALS, json(200, page([]))),
    ])
    const input = await screen.findByLabelText("Customer's deal id")
    await portal.user.click(screen.getByRole('button', { name: 'Find Deal' }))
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(input)
    expect(portal.calls.filter((call) => call.path === `${DEALS}/lookup`)).toHaveLength(0)
    await portal.user.type(input, 'NOPE-1')
    await portal.user.click(screen.getByRole('button', { name: 'Find Deal' }))
    expect(await screen.findByText(/No Deal has that deal id/)).toBeTruthy()
    expect(input.getAttribute('aria-describedby')).toBeTruthy()
  })
})

describe('Sales history: one Deal', () => {
  const deal = dealBody(1, {
    dealId: 'D-1',
    outcome: 'open',
    callCount: 3,
    appearedInImport: false,
  })

  test('shows the Deal and changes its Outcome with one request that carries only the Outcome', async () => {
    let outcome = 'open'
    const portal = visit(`/sales-history/deals/${deal.id}`, 'owner', [
      route('PUT', `${DEALS}/${deal.id}/outcome`, () => {
        outcome = 'won'
        return json(200, { ...deal, outcome })
      }),
      route('GET', `${DEALS}/${deal.id}`, () => json(200, { ...deal, outcome })),
    ])
    expect(await screen.findByText('D-1')).toBeTruthy()
    expect(screen.getByText(/no CSV has named it/i)).toBeTruthy()
    await portal.user.selectOptions(screen.getByLabelText('Outcome'), 'won')
    await portal.user.click(screen.getByRole('button', { name: 'Save Outcome' }))
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Notice' }).textContent).toContain('Outcome saved')
    )
    expect(portal.calls.find((call) => call.method === 'PUT')?.body).toEqual({ outcome: 'won' })
  })

  test('says what a change of Outcome does to search', async () => {
    visit(`/sales-history/deals/${deal.id}`, 'owner', [
      route('GET', `${DEALS}/${deal.id}`, json(200, deal)),
    ])
    expect(await screen.findByText(/search may lag/i)).toBeTruthy()
  })

  test('a Deal that is gone is explained', async () => {
    visit(`/sales-history/deals/${deal.id}`, 'owner', [
      route(
        'GET',
        `${DEALS}/${deal.id}`,
        failure(404, SALES_HISTORY_ERRORS['deal.not_found'].code)
      ),
    ])
    expect((await screen.findByRole('alert')).textContent).toContain('no longer exists')
  })

  test('a refused change of Outcome is explained and the form stays', async () => {
    const portal = visit(`/sales-history/deals/${deal.id}`, 'owner', [
      route(
        'PUT',
        `${DEALS}/${deal.id}/outcome`,
        failure(404, SALES_HISTORY_ERRORS['deal.not_found'].code)
      ),
      route('GET', `${DEALS}/${deal.id}`, json(200, deal)),
    ])
    await portal.user.selectOptions(await screen.findByLabelText('Outcome'), 'lost')
    await portal.user.click(screen.getByRole('button', { name: 'Save Outcome' }))
    expect((await screen.findAllByRole('alert'))[0]?.textContent).toContain('no longer exists')
  })
})

describe('Sales history: Deal imports', () => {
  const csv = (
    name = 'deals.csv',
    text = 'deal_id,outcome,closed_at,amount,currency,name\r\nD-1,won,,,,\r\n'
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
  const posts = (portal: ReturnType<typeof visit>) =>
    portal.calls.filter((call) => call.method === 'POST' && call.path === IMPORTS)
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
  afterEach(() => {
    URL.createObjectURL = original.create
    URL.revokeObjectURL = original.revoke
  })

  test('the template download is the contract header and one example row', async () => {
    let blob: Blob | undefined
    URL.createObjectURL = (made: Blob | MediaSource) => {
      blob = made as Blob
      return 'blob:template'
    }
    URL.revokeObjectURL = () => {}
    visit('/sales-history/imports', 'owner', [route('GET', IMPORTS, json(200, page([])))])
    const link = await screen.findByRole('link', { name: 'Download the CSV template' })
    expect(link.getAttribute('download')).toBe('deal-import-template.csv')
    expect(link.getAttribute('href')).toBe('blob:template')
    const text = await (blob as Blob).text()
    expect(text.split('\r\n')[0]).toBe('deal_id,outcome,closed_at,amount,currency,name')
  })

  test.each([
    ['deals.xlsx', 'deal_id,outcome\r\n', /CSV/],
    ['empty.csv', '', /empty/],
    ['bad.csv', 'id,result\r\nD-1,won\r\n', /template|columns/i],
  ])(
    '%s is stopped in the browser with a reason, and nothing is sent',
    async (name, text, words) => {
      const portal = visit('/sales-history/imports', 'owner', [
        route('GET', IMPORTS, json(200, page([]))),
      ])
      await screen.findByLabelText(/choose a csv/i)
      choose(csv(name, text))
      expect(await uploadError()).toMatch(words)
      expect(posts(portal)).toHaveLength(0)
    }
  )

  test('a file over the limit is stopped in the browser and the limit is named', async () => {
    const portal = visit('/sales-history/imports', 'owner', [
      route('GET', IMPORTS, json(200, page([]))),
    ])
    await screen.findByLabelText(/choose a csv/i)
    const big = csv()
    Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 })
    choose(big)
    expect(await uploadError()).toContain('10 MB')
    expect(posts(portal)).toHaveLength(0)
  })

  test('the limits are shown before anything is chosen', async () => {
    visit('/sales-history/imports', 'owner', [route('GET', IMPORTS, json(200, page([])))])
    const hint = await screen.findByText(/10 MB/)
    expect(hint.textContent).toMatch(/50,000 rows/)
  })

  test('202: sends the file as multipart with an idempotency key, names the import and refreshes the list', async () => {
    let created = false
    const made = importBody(5, {
      state: 'uploaded',
      rowCount: null,
      appliedCount: null,
      rejectedCount: null,
    })
    const portal = visit('/sales-history/imports', 'owner', [
      route('POST', IMPORTS, () => {
        created = true
        return json(202, made)
      }),
      route('GET', IMPORTS, () => json(200, page(created ? [made] : []))),
    ])
    await screen.findByLabelText(/choose a csv/i)
    choose(csv('deals.csv'))
    await waitFor(() => expect(status().textContent).toContain('Uploaded deals.csv'))
    const call = posts(portal)[0]
    expect(call?.headers.get(IDEMPOTENCY)).toMatch(/^portal-/)
    expect(call?.headers.get('content-type')).toBeNull()
    const form = call?.init.body
    expect(form instanceof FormData).toBe(true)
    expect(((form as FormData).get('file') as File).name).toBe('deals.csv')
    await waitFor(() => expect(screen.getByRole('link', { name: /^Report/ })).toBeTruthy())
  })

  test.each([
    [413, SALES_HISTORY_ERRORS['deal_import.too_large'].code, /larger than 10 MB/],
    [415, SALES_HISTORY_ERRORS['deal_import.unsupported_type'].code, /not supported/],
    [422, SALES_HISTORY_ERRORS['deal_import.header_invalid'].code, /first row does not match/],
    [403, ERRORS['auth.forbidden'].code, /role does not allow/],
  ] as const)('%s %s is explained', async (code, name, words) => {
    visit('/sales-history/imports', 'owner', [
      route('POST', IMPORTS, failure(code, name)),
      route('GET', IMPORTS, json(200, page([]))),
    ])
    await screen.findByLabelText(/choose a csv/i)
    choose(csv())
    expect(await uploadError()).toMatch(words)
  })

  test('a 429 with Retry-After names the wait and a retry keeps the same idempotency key', async () => {
    const gate = gatedSleep()
    let attempts = 0
    const portal = visit(
      '/sales-history/imports',
      'owner',
      [
        route('POST', IMPORTS, () => {
          attempts += 1
          return attempts === 1
            ? failure(429, ERRORS['rate.limited'].code, undefined, { 'retry-after': '30' })
            : json(
                202,
                importBody(5, {
                  state: 'uploaded',
                  rowCount: null,
                  appliedCount: null,
                  rejectedCount: null,
                })
              )
        }),
        route('GET', IMPORTS, json(200, page([]))),
      ],
      { sleep: gate.sleep }
    )
    await screen.findByLabelText(/choose a csv/i)
    choose(csv())
    expect(await uploadError()).toContain('30 seconds')
    const retry = await screen.findByRole('button', { name: 'Retry deals.csv' })
    expect(retry.getAttribute('aria-disabled')).toBe('true')
    gate.release()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Retry deals.csv' }).getAttribute('aria-disabled')
      ).not.toBe('true')
    )
    await portal.user.click(screen.getByRole('button', { name: 'Retry deals.csv' }))
    await waitFor(() => expect(posts(portal)).toHaveLength(2))
  })

  test('an answer that is not 202 is a failure of unknown outcome, retried with the same key', async () => {
    let attempts = 0
    const portal = visit('/sales-history/imports', 'owner', [
      route('POST', IMPORTS, () => {
        attempts += 1
        return attempts === 1
          ? json(200, importBody(5))
          : json(
              202,
              importBody(5, {
                state: 'uploaded',
                rowCount: null,
                appliedCount: null,
                rejectedCount: null,
              })
            )
      }),
      route('GET', IMPORTS, json(200, page([]))),
    ])
    await screen.findByLabelText(/choose a csv/i)
    choose(csv())
    expect(await uploadError()).toContain('could not read')
    await portal.user.click(screen.getByRole('button', { name: 'Retry deals.csv' }))
    await waitFor(() => expect(status().textContent).toContain('Uploaded deals.csv'))
    const [first, second] = posts(portal)
    expect(first?.headers.get(IDEMPOTENCY)).toBe(second?.headers.get(IDEMPOTENCY))
  })

  test('lists imports with state and counts and pages with the cursor', async () => {
    const portal = visit('/sales-history/imports', 'admin', [
      route('GET', IMPORTS, (call) =>
        param(call.url, 'cursor') === 'c2'
          ? json(
              200,
              page([
                importBody(2, {
                  state: 'failed',
                  failureReason: 'too_many_rows',
                  rowCount: null,
                  appliedCount: null,
                  rejectedCount: null,
                }),
              ])
            )
          : json(200, page([importBody(1)], 'c2'))
      ),
    ])
    expect(await screen.findByText('Completed')).toBeTruthy()
    await portal.user.click(screen.getByRole('button', { name: 'Load more imports' }))
    expect(await screen.findByText('Failed')).toBeTruthy()
    expect(param(portal.calls.find((call) => call.path === IMPORTS)?.url ?? '', 'limit')).toBe('25')
  })

  test('an import still running is asked about again, no sooner than three seconds, and not once it is done', async () => {
    const gate = gatedSleep()
    let reads = 0
    const running = importBody(1, {
      state: 'processing',
      rowCount: null,
      appliedCount: null,
      rejectedCount: null,
    })
    visit(
      `/sales-history/imports/${running.id}`,
      'owner',
      [
        route('GET', `${IMPORTS}/${running.id}`, () => {
          reads += 1
          return json(200, reads >= 2 ? importBody(1) : running)
        }),
        route('GET', `${IMPORTS}/${running.id}/rows`, json(200, page([]))),
      ],
      { sleep: gate.sleep }
    )
    await screen.findByText('Processing')
    await waitFor(() => expect(gate.waits).toHaveLength(1))
    expect(gate.waits[0]).toBeGreaterThanOrEqual(3_000)
    gate.release()
    await screen.findByText('Completed')
    gate.release()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(reads).toBe(2)
  })

  test('the report lists rejected rows with the reason in words, the deal id as text, and pages with the cursor', async () => {
    const done = importBody(1, { rowCount: 3, appliedCount: 1, rejectedCount: 2 })
    const portal = visit(`/sales-history/imports/${done.id}`, 'owner', [
      route('GET', `${IMPORTS}/${done.id}`, json(200, done)),
      route('GET', `${IMPORTS}/${done.id}/rows`, (call) =>
        param(call.url, 'cursor') === 'c2'
          ? json(
              200,
              page([
                rowBody(4, { dealId: '+DUP', result: 'rejected', reason: 'duplicate_in_file' }),
              ])
            )
          : json(
              200,
              page(
                [rowBody(2, { dealId: '=BAD()', result: 'rejected', reason: 'invalid_outcome' })],
                'c2'
              )
            )
      ),
    ])
    const cell = await screen.findByText('=BAD()')
    expect(cell.closest('a')).toBeNull()
    const row = cell.closest('tr') as HTMLElement
    expect(within(row).getByText('2')).toBeTruthy()
    expect(within(row).getByText('Rejected')).toBeTruthy()
    expect(row.textContent).toContain('not won, lost or open')
    expect(
      param(portal.calls.find((call) => call.path.endsWith('/rows'))?.url ?? '', 'result')
    ).toBe('rejected')
    await portal.user.click(screen.getByRole('button', { name: 'Load more rows' }))
    expect(await screen.findByText('+DUP')).toBeTruthy()
  })

  test('"all rows" asks for every row, not only the rejected ones', async () => {
    const done = importBody(1)
    const portal = visit(`/sales-history/imports/${done.id}`, 'owner', [
      route('GET', `${IMPORTS}/${done.id}`, json(200, done)),
      route('GET', `${IMPORTS}/${done.id}/rows`, (call) =>
        json(
          200,
          page([
            rowBody(
              2,
              param(call.url, 'result') === 'rejected'
                ? { dealId: 'ONLY-BAD', result: 'rejected', reason: 'invalid_outcome' }
                : { dealId: 'ANY-ROW' }
            ),
          ])
        )
      ),
    ])
    await screen.findByText('ONLY-BAD')
    await portal.user.click(screen.getByRole('checkbox', { name: /only the rejected rows/i }))
    expect(await screen.findByText('ANY-ROW')).toBeTruthy()
  })

  test('a failed import says why in words and offers no report', async () => {
    const failed = importBody(1, {
      state: 'failed',
      failureReason: 'too_many_rows',
      rowCount: null,
      appliedCount: null,
      rejectedCount: null,
    })
    const portal = visit(`/sales-history/imports/${failed.id}`, 'owner', [
      route('GET', `${IMPORTS}/${failed.id}`, json(200, failed)),
    ])
    expect(await screen.findByText(/more than 50,000 rows/)).toBeTruthy()
    expect(portal.calls.filter((call) => call.path.endsWith('/rows'))).toHaveLength(0)
  })

  test('the rejected rows can be downloaded as CSV with formula-looking ids made safe', async () => {
    let blob: Blob | undefined
    URL.createObjectURL = (made: Blob | MediaSource) => {
      blob = made as Blob
      return 'blob:report'
    }
    URL.revokeObjectURL = () => {}
    const done = importBody(1)
    visit(`/sales-history/imports/${done.id}`, 'owner', [
      route('GET', `${IMPORTS}/${done.id}`, json(200, done)),
      route(
        'GET',
        `${IMPORTS}/${done.id}/rows`,
        json(
          200,
          page([
            rowBody(2, {
              dealId: '=HYPERLINK("http://evil.example")',
              result: 'rejected',
              reason: 'invalid_outcome',
            }),
            rowBody(3, { dealId: '@x', result: 'rejected', reason: 'invalid_amount' }),
            rowBody(4, { dealId: null, result: 'rejected', reason: 'invalid_deal_id' }),
          ])
        )
      ),
    ])
    const link = await screen.findByRole('link', { name: /Download these rows/ })
    expect(link.getAttribute('download')).toBe('rejected-rows.csv')
    const lines = (await (blob as Blob).text()).split('\r\n')
    expect(lines[0]).toBe('row,deal_id,reason')
    expect(lines[1]).toBe(`2,"'=HYPERLINK(""http://evil.example"")",invalid_outcome`)
    expect(lines[2]).toBe("3,'@x,invalid_amount")
    expect(lines[3]).toBe('4,,invalid_deal_id')
  })

  test('an import that is gone is explained', async () => {
    visit(`/sales-history/imports/${hexId('dimp', 9)}`, 'owner', [
      route(
        'GET',
        `${IMPORTS}/${hexId('dimp', 9)}`,
        failure(404, SALES_HISTORY_ERRORS['deal_import.not_found'].code)
      ),
    ])
    expect((await screen.findByRole('alert')).textContent).toContain('no longer exists')
  })
})

describe('Sales history: another Organization', () => {
  test('after a switch the new Organization is shown and the old one never is', async () => {
    let who: 'A' | 'B' = 'A'
    const portal = visit('/sales-history/deals', 'owner', [
      route('GET', DEALS, () =>
        json(200, page([dealBody(who === 'A' ? 1 : 2, { dealId: `${who}-DEAL` })]))
      ),
      route('POST', '/v1/client/sessions/refresh', () =>
        json(200, tokens({ accessToken: 'access-2', organization: { id: 'org_2', role: 'owner' } }))
      ),
    ])
    await screen.findByRole('link', { name: 'A-DEAL' })
    who = 'B'
    await act(() => portal.app.session.refresh('access-1'))
    await screen.findByRole('link', { name: 'B-DEAL' })
    expect(screen.queryByRole('link', { name: 'A-DEAL' })).toBeNull()
  })
})

describe('Sales history: forms are accessible', () => {
  const dealId = hexId('deal', 1)
  const handlers = [
    route('GET', RIGHTS, json(200, rightsBody({ confirmedVersion: null }))),
    route('GET', DEALS, json(200, page([dealBody(1)]))),
    route('GET', `${DEALS}/${dealId}`, json(200, dealBody(1))),
    route('GET', IMPORTS, json(200, page([importBody(1)]))),
  ]

  test.each([
    ['/sales-history/rights', 'checkbox'],
    ['/sales-history/deals', 'textbox'],
    [`/sales-history/deals/${dealId}`, 'combobox'],
    ['/sales-history/imports', 'button'],
  ])(
    '%s: every control has a name, ids are unique, and a table has a labelled scroll region',
    async (url, role) => {
      visit(url, 'owner', handlers)
      await screen.findAllByRole(role)
      await waitFor(() =>
        expect(document.querySelector('[role="status"]:not([aria-label])')).toBeNull()
      )
      const controls = [...document.querySelectorAll('main input, main select, main button')]
      for (const control of controls) {
        const name = control.getAttribute('aria-label') ?? control.textContent ?? ''
        const labelled =
          name.trim() !== '' ||
          (control.id !== '' && document.querySelector(`label[for="${control.id}"]`) !== null)
        expect(labelled).toBe(true)
      }
      const ids = [...document.querySelectorAll('[id]')].map((element) => element.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const table of document.querySelectorAll('main table')) {
        expect(table.closest('[role="region"][aria-label]')).not.toBeNull()
      }
    }
  )
})

describe('Sales history review round 1', () => {
  const WORDING_2: RightsWording = {
    heading: 'Confirm version two',
    paragraphs: ['Second wording.'],
    checkbox: 'I confirm the second wording.',
  }
  const wordings = RIGHTS_WORDING as Record<number, RightsWording>
  afterEach(() => {
    delete wordings[2]
  })

  test('a tick under one wording version is not carried to another', async () => {
    wordings[2] = WORDING_2
    let current = 1
    const portal = visit('/sales-history/rights', 'owner', [
      route('PUT', RIGHTS, () => {
        current = 2
        return failure(409, SALES_HISTORY_ERRORS['rights.version_outdated'].code)
      }),
      route('GET', RIGHTS, () =>
        json(200, rightsBody({ currentWordingVersion: current, confirmedVersion: null }))
      ),
    ])
    await portal.user.click(
      await screen.findByRole('checkbox', { name: /I confirm that I am authorised/ })
    )
    await portal.user.click(screen.getByRole('button', { name: 'Confirm' }))
    const second = await screen.findByRole('checkbox', { name: /I confirm the second wording/ })
    expect((second as HTMLInputElement).checked).toBe(false)
    await portal.user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(second.getAttribute('aria-invalid')).toBe('true')
    expect(portal.calls.filter((call) => call.method === 'PUT')).toHaveLength(1)
  })

  test('a recorded confirmation stays recorded when the read after it fails', async () => {
    let confirmed = false
    const portal = visit('/sales-history/rights', 'owner', [
      route('PUT', RIGHTS, () => {
        confirmed = true
        return json(200, rightsBody())
      }),
      route('GET', RIGHTS, () =>
        confirmed
          ? failure(500, ERRORS['server.unavailable'].code)
          : json(200, rightsBody({ confirmedVersion: null }))
      ),
    ])
    await portal.user.click(
      await screen.findByRole('checkbox', { name: /I confirm that I am authorised/ })
    )
    await portal.user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Notice' }).textContent).toContain('recorded')
    )
  })

  test('an import refused for want of a confirmation links to it and comes back to the imports', async () => {
    let confirmed = false
    const portal = visit('/sales-history/imports', 'owner', [
      route(
        'POST',
        IMPORTS,
        failure(403, SALES_HISTORY_ERRORS['rights.confirmation_required'].code, {
          wordingVersion: 1,
        })
      ),
      route('PUT', RIGHTS, () => {
        confirmed = true
        return json(200, rightsBody())
      }),
      route('GET', RIGHTS, () => json(200, rightsBody({ confirmedVersion: confirmed ? 1 : null }))),
      route('GET', IMPORTS, json(200, page([]))),
    ])
    await screen.findByLabelText(/choose a csv/i)
    fireEvent.change(screen.getByLabelText(/choose a csv/i), {
      target: {
        files: [
          new File(
            ['deal_id,outcome,closed_at,amount,currency,name\r\nD-1,won,,,,\r\n'],
            'deals.csv'
          ),
        ],
      },
    })
    const link = await screen.findByRole('link', { name: 'Confirm the rights wording' })
    expect(link.getAttribute('href')).toContain('from=%2Fsales-history%2Fimports')
    await portal.user.click(link)
    await portal.user.click(
      await screen.findByRole('checkbox', { name: /I confirm that I am authorised/ })
    )
    await portal.user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByRole('heading', { name: 'Deal imports' })).toBeTruthy()
  })

  test('an Outcome that was saved is not reported as failed when the read after it fails', async () => {
    const deal = dealBody(1)
    let saved = false
    visit(`/sales-history/deals/${deal.id}`, 'owner', [
      route('PUT', `${DEALS}/${deal.id}/outcome`, () => {
        saved = true
        return json(200, { ...deal, outcome: 'won' })
      }),
      route('GET', `${DEALS}/${deal.id}`, () =>
        saved ? failure(500, ERRORS['server.unavailable'].code) : json(200, deal)
      ),
    ])
    const user = (await import('@testing-library/user-event')).default.setup()
    await user.selectOptions(await screen.findByLabelText('Outcome'), 'won')
    await user.click(screen.getByRole('button', { name: 'Save Outcome' }))
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Notice' }).textContent).toContain('Outcome saved')
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('the Outcome select follows a change made elsewhere until the person touches it', async () => {
    const deal = dealBody(1, { outcome: 'open' })
    let outcome = 'open'
    const portal = visit(`/sales-history/deals/${deal.id}`, 'owner', [
      route('GET', `${DEALS}/${deal.id}`, () => json(200, { ...deal, outcome })),
    ])
    const select = (await screen.findByLabelText('Outcome')) as HTMLSelectElement
    expect(select.value).toBe('open')
    outcome = 'lost'
    await act(() => portal.app.queryClient.invalidateQueries())
    await waitFor(() => expect(select.value).toBe('lost'))
    await portal.user.selectOptions(select, 'won')
    outcome = 'open'
    await act(() => portal.app.queryClient.invalidateQueries())
    await waitFor(() => expect(screen.getAllByText('Open').length).toBeGreaterThan(0))
    expect(select.value).toBe('won')
  })

  test('the screen-reader text of an import link has the date as it is shown, not the raw time', async () => {
    visit('/sales-history/imports', 'owner', [
      route('GET', IMPORTS, json(200, page([importBody(1)]))),
    ])
    const link = await screen.findByRole('link', { name: /^Report/ })
    expect(link.textContent).not.toContain('2026-10-13T')
    expect(link.textContent).toContain(
      new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        Date.parse('2026-10-13T09:30:00Z')
      )
    )
  })

  test('before the role is known nothing mounts and nothing is requested', () => {
    const double = fakeFetch()
    const app = createApp({
      env: TEST_ENV,
      reporter: createReporter(() => {}),
      fetch: double.fetch,
    })
    const { container } = render(
      <AppContext.Provider value={app}>
        <SalesLayout />
      </AppContext.Provider>
    )
    expect(container.textContent).toBe('')
    expect(double.calls).toHaveLength(0)
  })
})
