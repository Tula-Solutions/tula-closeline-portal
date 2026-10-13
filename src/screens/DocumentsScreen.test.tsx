import { describe, expect, test } from 'bun:test'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { ERRORS, MAX_DOCUMENT_BYTES, PLAYBOOK_ERRORS } from 'tula-closeline-contract'
import { documentBody, page } from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal, waitUntilGone } from '~/testing/render'

const DOCS = '/v1/playbook/documents'
const IDEMPOTENCY = 'idempotency-key'
type Role = 'owner' | 'admin' | 'manager' | 'rep'

function visit(
  role: Role,
  handlers: Handler[],
  extra: {
    sleep?: (milliseconds: number) => Promise<void>
    organization?: string
    strict?: boolean
  } = {}
) {
  return renderPortal({
    url: '/playbook',
    signedIn: tokens({ organization: { id: extra.organization ?? 'org_1', role } }),
    handlers,
    ...(extra.sleep ? { sleep: extra.sleep } : {}),
    ...(extra.strict ? { strict: true } : {}),
  })
}

const list = (items: ReturnType<typeof documentBody>[], nextCursor: string | null = null) =>
  route('GET', DOCS, json(200, page(items, nextCursor)))

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

function pdf(name = 'plan.pdf', size = 10) {
  const file = new File(['x'.repeat(Math.min(size, 10))], name, { type: 'application/pdf' })
  if (size > 10) {
    Object.defineProperty(file, 'size', { value: size })
  }
  return file
}

/** The text of the uploads region once an upload has failed in it (a failure is announced by that region, not by an alert of its own). */
async function uploadError(): Promise<string> {
  return waitFor(() => {
    const text = screen.getByRole('status', { name: 'Uploads' }).textContent ?? ''
    if (!text.includes('Error:')) {
      throw new Error('no upload error yet')
    }
    return text
  })
}

const chooser = () => screen.getByLabelText(/choose files/i)
const choose = (...files: File[]) => fireEvent.change(chooser(), { target: { files } })
const uploads = (portal: ReturnType<typeof visit>) =>
  portal.calls.filter((call) => call.method === 'POST' && call.path === DOCS)

describe('Playbook documents: who sees what', () => {
  test.each([['manager'], ['rep']] as const)(
    'a %s sees the list and no way to change it',
    async (role) => {
      visit(role, [list([documentBody(1, { fileName: 'Pricing.pdf' })])])
      await screen.findByText('Pricing.pdf')
      expect(screen.queryByLabelText(/choose files/i)).toBeNull()
      expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull()
    }
  )

  test.each([['owner'], ['admin']] as const)('an %s can upload and delete', async (role) => {
    visit(role, [list([documentBody(1, { fileName: 'Pricing.pdf' })])])
    await screen.findByText('Pricing.pdf')
    expect(chooser()).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete Pricing.pdf' })).toBeTruthy()
  })

  test('the navigation has a Playbook link for every role', async () => {
    visit('rep', [list([])])
    expect(await screen.findByRole('link', { name: 'Playbook' })).toBeTruthy()
  })

  test('a 403 on the list is explained, not shown as an empty Playbook', async () => {
    visit('rep', [route('GET', DOCS, failure(403, ERRORS['auth.forbidden'].code))])
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Your role does not allow this'
    )
  })
})

describe('Playbook documents: the list', () => {
  test('shows name, type, size, state, pages and when it was added', async () => {
    visit('rep', [
      list([
        documentBody(1, { fileName: 'Pricing.pdf', sizeBytes: 3 * 1024 * 1024, pageCount: 12 }),
        documentBody(2, {
          fileName: 'Deck.pptx',
          mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          sizeBytes: 900,
          pageCount: null,
          state: 'uploaded',
        }),
      ]),
    ])
    const row = (await screen.findByText('Pricing.pdf')).closest('tr') as HTMLElement
    expect(within(row).getByText('PDF')).toBeTruthy()
    expect(within(row).getByText('3.0 MB')).toBeTruthy()
    expect(within(row).getByText('Ready')).toBeTruthy()
    expect(within(row).getByText('12')).toBeTruthy()
    expect(within(row).getByText(/2026/)).toBeTruthy()
    const second = screen.getByText('Deck.pptx').closest('tr') as HTMLElement
    expect(within(second).getByText('PowerPoint')).toBeTruthy()
    expect(within(second).getByText('900 bytes')).toBeTruthy()
    expect(within(second).getByText('Uploaded, waiting to be processed')).toBeTruthy()
  })

  test.each([
    ['too_many_pages', /more than 300 pages/],
    ['unreadable', /could not read this file/],
    ['password_protected', /password protected/],
    ['no_text', /no text/],
    ['processing_failed', /went wrong while processing/],
  ] as const)('a document that failed for %s says what to do', async (reason, words) => {
    visit('rep', [
      list([documentBody(1, { state: 'failed', failureReason: reason, pageCount: null })]),
    ])
    const row = (await screen.findByText('Document 1.pdf')).closest('tr') as HTMLElement
    expect(within(row).getByText('Failed')).toBeTruthy()
    expect(row.textContent).toMatch(words)
  })

  test('asks for 25 at a time and pages with the cursor', async () => {
    const portal = visit('rep', [
      route('GET', DOCS, (call) =>
        new URL(call.url, 'http://x').searchParams.get('cursor') === 'c2'
          ? json(200, page([documentBody(2, { fileName: 'Second.pdf' })]))
          : json(200, page([documentBody(1, { fileName: 'First.pdf' })], 'c2'))
      ),
    ])
    await screen.findByText('First.pdf')
    expect(
      new URL(
        portal.calls.find((call) => call.path === DOCS)?.url ?? '',
        'http://x'
      ).searchParams.get('limit')
    ).toBe('25')
    await portal.user.click(screen.getByRole('button', { name: 'Load more documents' }))
    await screen.findByText('Second.pdf')
    expect(screen.getByText('First.pdf')).toBeTruthy()
  })

  test('says so when there is nothing', async () => {
    visit('rep', [list([])])
    expect(await screen.findByText(/no documents/i)).toBeTruthy()
  })

  test('the state filter asks the service for that state, and deleted is among them', async () => {
    const portal = visit('rep', [
      route('GET', DOCS, (call) =>
        new URL(call.url, 'http://x').searchParams.get('state') === 'failed'
          ? json(
              200,
              page([
                documentBody(2, {
                  fileName: 'Broken.pdf',
                  state: 'failed',
                  failureReason: 'unreadable',
                  pageCount: null,
                }),
              ])
            )
          : json(200, page([documentBody(1, { fileName: 'Fine.pdf' })]))
      ),
    ])
    await screen.findByText('Fine.pdf')
    const filter = screen.getByLabelText('Show')
    expect(
      within(filter)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual([
      'All current documents',
      'Uploaded',
      'Processing',
      'Ready',
      'Failed',
      'Deleted (can be restored)',
    ])
    await portal.user.selectOptions(filter, 'failed')
    await screen.findByText('Broken.pdf')
    expect(screen.queryByText('Fine.pdf')).toBeNull()
  })

  test('a hostile file name is shown as inert text: no markup, no link, no script', async () => {
    const name = '<img src=x onerror=alert(1)>.pdf'
    const link = 'javascript:alert(1).pdf'
    visit('owner', [
      list([documentBody(1, { fileName: name }), documentBody(2, { fileName: link })]),
    ])
    const row = (await screen.findByText(name)).closest('tr') as HTMLElement
    expect(row.querySelector('img')).toBeNull()
    expect(row.querySelector('a')).toBeNull()
    expect(screen.getByText(link).closest('a')).toBeNull()
    expect(screen.getByRole('button', { name: `Delete ${name}` })).toBeTruthy()
  })

  test('invisible characters inside a name do not reach the names of its buttons', async () => {
    visit('owner', [list([documentBody(1, { fileName: 'Pri\u200bcing.pdf' })])])
    expect(await screen.findByRole('button', { name: 'Delete Pricing.pdf' })).toBeTruthy()
  })
})

describe('Playbook documents: another Organization', () => {
  test('after a switch the new Organization is shown and the old one never is', async () => {
    let who: 'A' | 'B' = 'A'
    const portal = visit('owner', [
      route('GET', DOCS, () =>
        json(200, page([documentBody(who === 'A' ? 1 : 2, { fileName: `${who} file.pdf` })]))
      ),
      route('POST', '/v1/client/sessions/refresh', () =>
        json(200, tokens({ accessToken: 'access-2', organization: { id: 'org_2', role: 'owner' } }))
      ),
    ])
    await screen.findByText('A file.pdf')
    who = 'B'
    const { act } = await import('@testing-library/react')
    await act(() => portal.app.session.refresh('access-1'))
    await screen.findByText('B file.pdf')
    expect(screen.queryByText('A file.pdf')).toBeNull()
  })
})

describe('Playbook documents: checks before sending', () => {
  test('a file type that is not accepted sends nothing and names the accepted types', async () => {
    const portal = visit('owner', [list([])])
    await screen.findByLabelText(/choose files/i)
    choose(new File(['x'], 'tool.exe'))
    expect(await uploadError()).toContain('.pdf')
    expect(uploads(portal)).toHaveLength(0)
  })

  test('a file over the limit sends nothing and says the limit', async () => {
    const portal = visit('owner', [list([])])
    await screen.findByLabelText(/choose files/i)
    choose(pdf('huge.pdf', MAX_DOCUMENT_BYTES + 1))
    expect(await uploadError()).toContain('25 MB')
    expect(uploads(portal)).toHaveLength(0)
  })

  test('an empty file sends nothing', async () => {
    const portal = visit('owner', [list([])])
    await screen.findByLabelText(/choose files/i)
    choose(new File([], 'empty.pdf'))
    expect(await uploadError()).toContain('empty')
    expect(uploads(portal)).toHaveLength(0)
  })
})

describe('Playbook documents: every answer to an upload', () => {
  test('201: sends the file as multipart with an idempotency key, then refreshes the list', async () => {
    let created = false
    const portal = visit('owner', [
      route('POST', DOCS, () => {
        created = true
        return json(
          201,
          documentBody(5, { fileName: 'plan.pdf', state: 'uploaded', pageCount: null })
        )
      }),
      route('GET', DOCS, () =>
        json(
          200,
          page(
            created
              ? [documentBody(5, { fileName: 'plan.pdf', state: 'uploaded', pageCount: null })]
              : []
          )
        )
      ),
    ])
    await screen.findByLabelText(/choose files/i)
    choose(pdf('plan.pdf'))
    await waitFor(() =>
      expect(screen.getByRole('status', { name: /uploads/i }).textContent).toContain('Uploaded')
    )
    const call = uploads(portal)[0]
    expect(call?.headers.get(IDEMPOTENCY)).toMatch(/^portal-/)
    expect(call?.headers.get('content-type')).toBeNull()
    const form = call?.init.body as FormData
    expect((form.get('file') as File).name).toBe('plan.pdf')
    await waitFor(() => expect(screen.getAllByText('plan.pdf').length).toBeGreaterThan(1))
  })

  test('200: a duplicate is "already uploaded" and shows the stored name, not the new one', async () => {
    visit('owner', [
      route('POST', DOCS, json(200, documentBody(1, { fileName: 'Stored name.pdf' }))),
      list([]),
    ])
    await screen.findByLabelText(/choose files/i)
    choose(pdf('new name.pdf'))
    const done = await screen.findByText(/already uploaded/i)
    expect(done.closest('li')?.textContent).toContain('Stored name.pdf')
  })

  test.each([
    [413, PLAYBOOK_ERRORS['document.too_large'].code, /larger than 25 MB/],
    [415, PLAYBOOK_ERRORS['document.unsupported_type'].code, /not supported/],
    [
      409,
      PLAYBOOK_ERRORS['document.quota_exceeded'].code,
      /Deleted documents count until they are purged/,
    ],
    [403, ERRORS['auth.forbidden'].code, /role does not allow/],
    [400, ERRORS['request.invalid'].code, /could not read that file/],
  ] as const)(
    '%s %s is explained and offers no retry of the same bytes',
    async (status, code, words) => {
      visit('owner', [route('POST', DOCS, failure(status, code)), list([])])
      await screen.findByLabelText(/choose files/i)
      choose(pdf())
      expect(await uploadError()).toMatch(words)
      expect(screen.queryByRole('button', { name: /^Retry/ })).toBeNull()
    }
  )

  test('429 with Retry-After: the wait is named, retry stays off until it is over, then reuses nothing stale', async () => {
    const gate = gatedSleep()
    let attempts = 0
    const portal = visit(
      'owner',
      [
        route('POST', DOCS, () => {
          attempts += 1
          return attempts === 1
            ? failure(429, ERRORS['rate.limited'].code, undefined, { 'retry-after': '30' })
            : json(
                201,
                documentBody(7, { fileName: 'plan.pdf', state: 'uploaded', pageCount: null })
              )
        }),
        list([]),
      ],
      { sleep: gate.sleep }
    )
    await screen.findByLabelText(/choose files/i)
    choose(pdf('plan.pdf'))
    expect(await uploadError()).toContain('30 seconds')
    const retry = await screen.findByRole('button', { name: 'Retry plan.pdf' })
    expect(retry.getAttribute('aria-disabled')).toBe('true')
    expect(gate.waits).toContain(30_000)
    await portal.user.click(retry)
    expect(uploads(portal)).toHaveLength(1)
    gate.release()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Retry plan.pdf' }).getAttribute('aria-disabled')
      ).not.toBe('true')
    )
    await portal.user.click(screen.getByRole('button', { name: 'Retry plan.pdf' }))
    await waitFor(() => expect(uploads(portal)).toHaveLength(2))
  })

  test('503 with Retry-After is respected and a retry carries the same idempotency key', async () => {
    const gate = gatedSleep()
    let attempts = 0
    const portal = visit(
      'owner',
      [
        route('POST', DOCS, () => {
          attempts += 1
          return attempts === 1
            ? failure(503, ERRORS['server.unavailable'].code, undefined, { 'retry-after': '5' })
            : json(
                201,
                documentBody(7, { fileName: 'plan.pdf', state: 'uploaded', pageCount: null })
              )
        }),
        list([]),
      ],
      { sleep: gate.sleep }
    )
    await screen.findByLabelText(/choose files/i)
    choose(pdf('plan.pdf'))
    expect(await uploadError()).toContain('5 seconds')
    gate.release()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Retry plan.pdf' }).getAttribute('aria-disabled')
      ).not.toBe('true')
    )
    await portal.user.click(screen.getByRole('button', { name: 'Retry plan.pdf' }))
    await waitFor(() => expect(uploads(portal)).toHaveLength(2))
    const [first, second] = uploads(portal)
    expect(first?.headers.get(IDEMPOTENCY)).toBe(second?.headers.get(IDEMPOTENCY))
  })

  test('504 from the service: nothing was stored, so it says the upload timed out and a retry carries the same key', async () => {
    let attempts = 0
    const portal = visit('owner', [
      route('POST', DOCS, () => {
        attempts += 1
        return attempts === 1
          ? failure(504, ERRORS['server.timeout'].code)
          : json(200, documentBody(7, { fileName: 'plan.pdf' }))
      }),
      list([]),
    ])
    await screen.findByLabelText(/choose files/i)
    choose(pdf('plan.pdf'))
    const text = await uploadError()
    expect(text).toContain('timed out')
    expect(text).not.toContain('may still have been stored')
    await portal.user.click(screen.getByRole('button', { name: 'Retry plan.pdf' }))
    await screen.findByText(/already uploaded/i)
    const [first, second] = uploads(portal)
    expect(first?.headers.get(IDEMPOTENCY)).toBe(second?.headers.get(IDEMPOTENCY))
  })

  test('no answer at all: it may or may not have arrived, and a retry does not store it twice', async () => {
    visit('owner', [
      route('POST', DOCS, () => {
        throw new TypeError('network down')
      }),
      list([]),
    ])
    await screen.findByLabelText(/choose files/i)
    choose(pdf('plan.pdf'))
    expect(await uploadError()).toContain('may or may not have arrived')
    expect(screen.getByRole('button', { name: 'Retry plan.pdf' })).toBeTruthy()
  })

  test('a definite refusal ends the key: choosing the file again gets a new one', async () => {
    const portal = visit('owner', [
      route('POST', DOCS, failure(409, PLAYBOOK_ERRORS['document.quota_exceeded'].code)),
      list([]),
    ])
    await screen.findByLabelText(/choose files/i)
    choose(pdf('plan.pdf'))
    await uploadError()
    choose(pdf('plan.pdf'))
    await waitFor(() => expect(uploads(portal)).toHaveLength(2))
    const [first, second] = uploads(portal)
    expect(first?.headers.get(IDEMPOTENCY)).not.toBe(second?.headers.get(IDEMPOTENCY))
  })

  test('dropping files on the drop area uploads them one after the other', async () => {
    const order: string[] = []
    const portal = visit('owner', [
      route('POST', DOCS, (call) => {
        order.push(((call.init.body as FormData).get('file') as File).name)
        return json(
          201,
          documentBody(order.length, {
            fileName: order.at(-1) ?? 'x.pdf',
            state: 'uploaded',
            pageCount: null,
          })
        )
      }),
      list([]),
    ])
    await screen.findByLabelText(/choose files/i)
    fireEvent.drop(screen.getByTestId('drop-area'), {
      dataTransfer: { files: [pdf('one.pdf'), pdf('two.pdf')] },
    })
    await waitFor(() => expect(order).toEqual(['one.pdf', 'two.pdf']))
    expect(uploads(portal)).toHaveLength(2)
  })
})

describe('Playbook documents: delete and restore', () => {
  const doc = documentBody(1, { fileName: 'Pricing.pdf' })
  const deleted = documentBody(1, {
    fileName: 'Pricing.pdf',
    state: 'deleted',
    pageCount: null,
    deletedAt: '2026-10-13T10:00:00Z',
    purgeAt: '2026-11-12T10:00:00Z',
  })

  test('cancelling the question sends nothing; confirming deletes and says until when it can be restored', async () => {
    let gone = false
    const portal = visit('admin', [
      route('DELETE', `${DOCS}/${doc.id}`, () => {
        gone = true
        return json(200, deleted)
      }),
      route('GET', DOCS, () => json(200, page(gone ? [] : [doc]))),
    ])
    await screen.findByText('Pricing.pdf')
    await portal.user.click(screen.getByRole('button', { name: 'Delete Pricing.pdf' }))
    await portal.user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(portal.calls.filter((call) => call.method === 'DELETE')).toHaveLength(0)
    await portal.user.click(screen.getByRole('button', { name: 'Delete Pricing.pdf' }))
    await portal.user.click(screen.getByRole('button', { name: 'Delete document' }))
    await waitUntilGone('Document 1.pdf')
    await waitFor(() =>
      expect(screen.getByRole('status', { name: /notice/i }).textContent).toMatch(
        /restore it until .*2026/i
      )
    )
  })

  test('a document already gone (404) on delete says to reload', async () => {
    const portal = visit('admin', [
      route(
        'DELETE',
        `${DOCS}/${doc.id}`,
        failure(404, PLAYBOOK_ERRORS['document.not_found'].code)
      ),
      list([doc]),
    ])
    await screen.findByText('Pricing.pdf')
    await portal.user.click(screen.getByRole('button', { name: 'Delete Pricing.pdf' }))
    await portal.user.click(screen.getByRole('button', { name: 'Delete document' }))
    expect((await screen.findByRole('alert')).textContent).toContain('no longer exists')
  })

  test('the deleted filter shows the purge time and restores', async () => {
    let restored = false
    const portal = visit('owner', [
      route('POST', `${DOCS}/${doc.id}/restore`, () => {
        restored = true
        return json(
          200,
          documentBody(1, { fileName: 'Pricing.pdf', state: 'processing', pageCount: null })
        )
      }),
      route('GET', DOCS, (call) =>
        new URL(call.url, 'http://x').searchParams.get('state') === 'deleted'
          ? json(200, page(restored ? [] : [deleted]))
          : json(200, page([]))
      ),
    ])
    await screen.findByLabelText('Show')
    await portal.user.selectOptions(screen.getByLabelText('Show'), 'deleted')
    const row = (await screen.findByText('Pricing.pdf')).closest('tr') as HTMLElement
    expect(row.textContent).toMatch(/Restorable until .*2026/)
    await portal.user.click(within(row).getByRole('button', { name: 'Restore Pricing.pdf' }))
    await waitUntilGone('Pricing.pdf')
    expect(screen.getByRole('status', { name: /notice/i }).textContent).toContain('Restored')
  })

  test('410: a document purged after its time cannot be restored, and the message says to upload it again', async () => {
    const portal = visit('owner', [
      route(
        'POST',
        `${DOCS}/${doc.id}/restore`,
        failure(410, PLAYBOOK_ERRORS['document.not_restorable'].code)
      ),
      route('GET', DOCS, (call) =>
        new URL(call.url, 'http://x').searchParams.get('state') === 'deleted'
          ? json(200, page([deleted]))
          : json(200, page([]))
      ),
    ])
    await screen.findByLabelText('Show')
    await portal.user.selectOptions(screen.getByLabelText('Show'), 'deleted')
    await portal.user.click(await screen.findByRole('button', { name: 'Restore Pricing.pdf' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/cannot be restored.*upload/i)
  })

  test('404 on restore says the document is gone', async () => {
    const portal = visit('owner', [
      route(
        'POST',
        `${DOCS}/${doc.id}/restore`,
        failure(404, PLAYBOOK_ERRORS['document.not_found'].code)
      ),
      route('GET', DOCS, (call) =>
        new URL(call.url, 'http://x').searchParams.get('state') === 'deleted'
          ? json(200, page([deleted]))
          : json(200, page([]))
      ),
    ])
    await screen.findByLabelText('Show')
    await portal.user.selectOptions(screen.getByLabelText('Show'), 'deleted')
    await portal.user.click(await screen.findByRole('button', { name: 'Restore Pricing.pdf' }))
    expect((await screen.findByRole('alert')).textContent).toContain('no longer exists')
  })

  test('a manager sees deleted documents but has no restore button', async () => {
    const portal = visit('manager', [
      route('GET', DOCS, (call) =>
        new URL(call.url, 'http://x').searchParams.get('state') === 'deleted'
          ? json(200, page([deleted]))
          : json(200, page([]))
      ),
    ])
    await screen.findByLabelText('Show')
    await portal.user.selectOptions(screen.getByLabelText('Show'), 'deleted')
    await screen.findByText('Pricing.pdf')
    expect(screen.queryByRole('button', { name: /Restore/ })).toBeNull()
  })
})

describe('Playbook documents: following documents that are still being processed', () => {
  const waiting = documentBody(1, { fileName: 'Pending.pdf', state: 'uploaded', pageCount: null })
  const ready = documentBody(1, { fileName: 'Pending.pdf', state: 'ready' })

  test('refreshes after a growing wait until nothing is pending, then stops; a state change alone does not shorten the wait', async () => {
    const gate = gatedSleep()
    let reads = 0
    const portal = visit(
      'rep',
      [
        route('GET', DOCS, () => {
          reads += 1
          return json(
            200,
            page([reads >= 4 ? ready : reads === 3 ? { ...waiting, state: 'processing' } : waiting])
          )
        }),
      ],
      { sleep: gate.sleep }
    )
    await screen.findByText('Uploaded, waiting to be processed')
    await waitFor(() => expect(gate.waits).toHaveLength(1))
    gate.release()
    await waitFor(() => expect(reads).toBe(2))
    await waitFor(() => expect(gate.waits).toHaveLength(2))
    gate.release()
    await screen.findByText('Being processed')
    await waitFor(() => expect(gate.waits).toHaveLength(3))
    expect(gate.waits.slice(0, 3)).toEqual([2_000, 4_000, 8_000])
    gate.release()
    await screen.findByText('Ready')
    const polls = portal.calls.filter((call) => call.path === DOCS).length
    // A round that has just ended may still have one wait pending; ending it asks nothing.
    gate.release()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(portal.calls.filter((call) => call.path === DOCS)).toHaveLength(polls)
  })

  test('a new pending document starts the waits again from the shortest', async () => {
    const gate = gatedSleep()
    let reads = 0
    visit(
      'rep',
      [
        route('GET', DOCS, () => {
          reads += 1
          const second = documentBody(2, {
            fileName: 'Second.pdf',
            state: 'uploaded',
            pageCount: null,
          })
          return json(200, page(reads >= 2 ? [waiting, second] : [waiting]))
        }),
      ],
      { sleep: gate.sleep }
    )
    await screen.findByText('Pending.pdf')
    await waitFor(() => expect(gate.waits).toHaveLength(1))
    gate.release()
    await screen.findByText('Second.pdf')
    // The old round's next wait (4 s) may be pending; the new round's first wait is the shortest.
    await waitFor(() => expect(gate.waits.at(-1)).toBe(2_000))
    expect(gate.waits.length).toBeGreaterThanOrEqual(3)
  })

  test('with three pages loaded and one pending document, each tick asks for exactly the three pages', async () => {
    const gate = gatedSleep()
    const portal = visit(
      'rep',
      [
        route('GET', DOCS, (call) => {
          const cursor = new URL(call.url, 'http://x').searchParams.get('cursor')
          if (cursor === 'c3') {
            return json(200, page([waiting]))
          }
          return cursor === 'c2'
            ? json(200, page([documentBody(2, { fileName: 'Two.pdf' })], 'c3'))
            : json(200, page([documentBody(3, { fileName: 'Three.pdf' })], 'c2'))
        }),
      ],
      { sleep: gate.sleep }
    )
    await screen.findByText('Three.pdf')
    await portal.user.click(screen.getByRole('button', { name: 'Load more documents' }))
    await screen.findByText('Two.pdf')
    await portal.user.click(screen.getByRole('button', { name: 'Load more documents' }))
    await screen.findByText('Pending.pdf')
    await waitFor(() => expect(gate.waits).toHaveLength(1))
    const reads = () => portal.calls.filter((call) => call.path === DOCS).length
    const before = reads()
    gate.release()
    await waitFor(() => expect(gate.waits).toHaveLength(2))
    expect(reads() - before).toBe(3)
  })

  test('waits grow when nothing changes, up to a ceiling', async () => {
    const gate = gatedSleep()
    visit('rep', [list([waiting])], { sleep: gate.sleep })
    await screen.findByText('Uploaded, waiting to be processed')
    for (let i = 1; i <= 6; i += 1) {
      await waitFor(() => expect(gate.waits).toHaveLength(i))
      gate.release()
    }
    const [first, second, third] = gate.waits
    expect(second).toBeGreaterThan(first as number)
    expect(third).toBeGreaterThan(second as number)
    expect(Math.max(...gate.waits)).toBeLessThanOrEqual(30_000)
  })

  test('nothing pending means no waiting at all', async () => {
    const gate = gatedSleep()
    visit('rep', [list([ready])], { sleep: gate.sleep })
    await screen.findByText('Ready')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(gate.waits).toHaveLength(0)
  })

  test('a hidden tab makes no request until it is shown again', async () => {
    const gate = gatedSleep()
    let reads = 0
    const portal = visit(
      'rep',
      [
        route('GET', DOCS, () => {
          reads += 1
          return json(200, page([waiting]))
        }),
      ],
      { sleep: gate.sleep }
    )
    await screen.findByText('Uploaded, waiting to be processed')
    await waitFor(() => expect(gate.waits).toHaveLength(1))
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    gate.release()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(reads).toBe(1)
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(reads).toBe(2))
    expect(portal.calls.length).toBeGreaterThan(0)
  })

  test('leaving the screen stops the polling', async () => {
    const gate = gatedSleep()
    let reads = 0
    const portal = visit(
      'rep',
      [
        route('GET', DOCS, () => {
          reads += 1
          return json(200, page([waiting]))
        }),
        route('GET', '/v1/teams', json(200, page([]))),
      ],
      { sleep: gate.sleep }
    )
    await screen.findByText('Uploaded, waiting to be processed')
    await waitFor(() => expect(gate.waits).toHaveLength(1))
    await portal.user.click(screen.getByRole('link', { name: 'Teams' }))
    await screen.findByRole('heading', { name: 'Teams' })
    gate.release()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(reads).toBe(1)
  })
})

describe('Playbook documents: under StrictMode, as in development', () => {
  test('a chosen file still uploads after the screen has mounted, cleaned up and mounted again', async () => {
    const portal = visit(
      'owner',
      [
        route(
          'POST',
          DOCS,
          json(201, documentBody(5, { fileName: 'plan.pdf', state: 'uploaded', pageCount: null }))
        ),
        list([]),
      ],
      { strict: true }
    )
    await screen.findByLabelText(/choose files/i)
    choose(pdf('plan.pdf'))
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Uploads' }).textContent).toContain(
        'Uploaded plan.pdf'
      )
    )
    expect(uploads(portal)).toHaveLength(1)
  })

  test('the follow-up poll asks once per round, not once per mount', async () => {
    const gate = gatedSleep()
    let reads = 0
    visit(
      'rep',
      [
        route('GET', DOCS, () => {
          reads += 1
          return json(
            200,
            page([documentBody(1, { fileName: 'Pending.pdf', state: 'uploaded', pageCount: null })])
          )
        }),
      ],
      { sleep: gate.sleep, strict: true }
    )
    await screen.findByText('Pending.pdf')
    await waitFor(() => expect(gate.waits.length).toBeGreaterThanOrEqual(1))
    const first = reads
    while (gate.waits.length < 2) {
      gate.release()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    gate.release()
    await waitFor(() => expect(reads).toBeGreaterThan(first))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(reads - first).toBeLessThanOrEqual(2)
  })
})

describe('Playbook documents: an upload that worked stays worked', () => {
  test('a failed refresh of the list afterwards does not turn a stored file into a failure', async () => {
    let created = false
    visit('owner', [
      route('POST', DOCS, () => {
        created = true
        return json(
          201,
          documentBody(5, { fileName: 'plan.pdf', state: 'uploaded', pageCount: null })
        )
      }),
      route('GET', DOCS, () =>
        created ? failure(500, ERRORS['server.internal'].code) : json(200, page([]))
      ),
    ])
    await screen.findByLabelText(/choose files/i)
    choose(pdf('plan.pdf'))
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Uploads' }).textContent).toContain(
        'Uploaded plan.pdf'
      )
    )
    expect(screen.getByRole('status', { name: 'Uploads' }).textContent).not.toContain('Error:')
    expect(screen.queryByRole('button', { name: 'Retry plan.pdf' })).toBeNull()
  })

  test('a failure is announced once, by the uploads region, not again by an alert inside it', async () => {
    visit('owner', [
      route('POST', DOCS, failure(409, PLAYBOOK_ERRORS['document.quota_exceeded'].code)),
      list([]),
    ])
    await screen.findByLabelText(/choose files/i)
    choose(pdf())
    await uploadError()
    expect(within(screen.getByRole('status', { name: 'Uploads' })).queryByRole('alert')).toBeNull()
  })
})

describe('Playbook documents: only the documented success codes count', () => {
  test('an upload answered 202 is not taken as stored: it is a failed upload of unknown outcome, retryable with the same key', async () => {
    const portal = visit('owner', [
      route('POST', DOCS, json(202, documentBody(5, { fileName: 'plan.pdf' }))),
      list([]),
    ])
    await screen.findByLabelText(/choose files/i)
    choose(pdf('plan.pdf'))
    expect(await uploadError()).toContain('could not read')
    expect(screen.getByRole('button', { name: 'Retry plan.pdf' })).toBeTruthy()
    expect(uploads(portal)).toHaveLength(1)
  })

  test('a delete answered 202 is an error, not a deletion', async () => {
    const doc = documentBody(1, { fileName: 'Pricing.pdf' })
    const portal = visit('admin', [
      route('DELETE', `${DOCS}/${doc.id}`, json(202, doc)),
      list([doc]),
    ])
    await screen.findByText('Pricing.pdf')
    await portal.user.click(screen.getByRole('button', { name: 'Delete Pricing.pdf' }))
    await portal.user.click(screen.getByRole('button', { name: 'Delete document' }))
    expect((await screen.findByRole('alert')).textContent).toContain('could not read')
  })

  test('a restore answered 202 is an error, not a restoration', async () => {
    const doc = documentBody(1, {
      fileName: 'Pricing.pdf',
      state: 'deleted',
      pageCount: null,
      deletedAt: '2026-10-13T10:00:00Z',
      purgeAt: '2026-11-12T10:00:00Z',
    })
    const portal = visit('owner', [
      route('POST', `${DOCS}/${doc.id}/restore`, json(202, doc)),
      route('GET', DOCS, (call) =>
        new URL(call.url, 'http://x').searchParams.get('state') === 'deleted'
          ? json(200, page([doc]))
          : json(200, page([]))
      ),
    ])
    await screen.findByLabelText('Show')
    await portal.user.selectOptions(screen.getByLabelText('Show'), 'deleted')
    await portal.user.click(await screen.findByRole('button', { name: 'Restore Pricing.pdf' }))
    expect((await screen.findByRole('alert')).textContent).toContain('could not read')
  })
})

describe('Playbook documents: a service newer than the contract', () => {
  test('a state this contract does not know fails the page by design, with the plain "could not read" message', async () => {
    visit('rep', [list([{ ...documentBody(1), state: 'archived' }])])
    expect((await screen.findByRole('alert')).textContent).toContain('could not read')
    expect(screen.queryByText('Document 1.pdf')).toBeNull()
  })
})

describe('Playbook documents: where focus goes', () => {
  const doc = documentBody(1, { fileName: 'Pricing.pdf' })

  test('cancelling the question puts focus back on the Delete button', async () => {
    const portal = visit('admin', [list([doc])])
    await screen.findByText('Pricing.pdf')
    await portal.user.click(screen.getByRole('button', { name: 'Delete Pricing.pdf' }))
    await portal.user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete Pricing.pdf' }))
  })

  test('a failed delete leaves focus on the Delete button, with the error tied to it', async () => {
    const portal = visit('admin', [
      route('DELETE', `${DOCS}/${doc.id}`, failure(500, ERRORS['server.internal'].code)),
      list([doc]),
    ])
    await screen.findByText('Pricing.pdf')
    await portal.user.click(screen.getByRole('button', { name: 'Delete Pricing.pdf' }))
    await portal.user.click(screen.getByRole('button', { name: 'Delete document' }))
    await screen.findByRole('alert')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete Pricing.pdf' }))
  })

  test('after a delete the row is gone, so focus moves to the page heading', async () => {
    let gone = false
    const portal = visit('admin', [
      route('DELETE', `${DOCS}/${doc.id}`, () => {
        gone = true
        return json(200, {
          ...doc,
          state: 'deleted',
          pageCount: null,
          deletedAt: '2026-10-13T10:00:00Z',
          purgeAt: '2026-11-12T10:00:00Z',
        })
      }),
      route('GET', DOCS, () => json(200, page(gone ? [] : [doc]))),
    ])
    await screen.findByText('Pricing.pdf')
    await portal.user.click(screen.getByRole('button', { name: 'Delete Pricing.pdf' }))
    await portal.user.click(screen.getByRole('button', { name: 'Delete document' }))
    await waitUntilGone('Pricing.pdf')
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Playbook' }))
    )
  })
})
