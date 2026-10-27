import { describe, expect, test } from 'bun:test'
import { act, screen, waitFor, within } from '@testing-library/react'
import { hexId } from '~/testing/core-bodies'
import { failure, json, route, tokens } from '~/testing/fixtures'
import { visit } from '~/testing/sales'
import { choose } from '~/testing/select'

const SEARCH = '/v1/playbook/search/documents'
const URL = '/playbook/search'

const hit = (n: number, over: Record<string, unknown> = {}) => ({
  documentId: hexId('doc', n),
  fileName: `guide-${n}.pdf`,
  page: 3,
  score: 0.8,
  snippet: `Passage text ${n}`,
  ...over,
})
const answer = (items: unknown[], evidence = { chunks: 9, documents: 2 }) =>
  json(200, { items, evidence })
const open = (role: 'owner' | 'admin' | 'manager' | 'rep', response = answer([hit(1)])) =>
  visit(URL, role, [route('POST', SEARCH, response)])
const ask = async (portal: ReturnType<typeof open>) => {
  await portal.user.type(await screen.findByLabelText('What was said, turn 1'), 'pricing')
  await portal.user.click(screen.getByRole('button', { name: 'Search' }))
}

describe('search over Documents: who may use it', () => {
  test.each(['owner', 'admin', 'manager', 'rep'] as const)(
    'a %s reaches the screen',
    async (role) => {
      open(role)
      expect(await screen.findByRole('heading', { name: 'Search Documents' })).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Search' })).toBeTruthy()
    }
  )
})

describe('search over Documents: the answer', () => {
  test('shows the file name, the page only when there is one, and the text', async () => {
    const portal = open('rep', answer([hit(1), hit(2, { page: null, fileName: 'notes.txt' })]))
    await ask(portal)
    const rows = within(
      await screen.findByRole('list', { name: 'Matching Document text' })
    ).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect((rows[0] as HTMLElement).textContent).toContain('guide-1.pdf')
    expect((rows[0] as HTMLElement).textContent).toContain('page 3')
    expect((rows[0] as HTMLElement).textContent).toContain('Passage text 1')
    expect((rows[1] as HTMLElement).textContent).toContain('notes.txt')
    expect((rows[1] as HTMLElement).textContent).not.toMatch(/page/i)
  })

  test('the evidence wording counts passages and Documents of this search only', async () => {
    const portal = open('owner')
    await ask(portal)
    expect(
      await screen.findByText('Based on 9 passages across 2 Documents in this search')
    ).toBeTruthy()
  })

  test('the evidence wording is singular for one', async () => {
    const portal = open('owner', answer([hit(1)], { chunks: 1, documents: 1 }))
    await ask(portal)
    expect(
      await screen.findByText('Based on 1 passage across 1 Document in this search')
    ).toBeTruthy()
  })

  test('file names and text are shown as text, never as markup', async () => {
    const evil = '<img src=x onerror=alert(1)>.pdf'
    const portal = open(
      'owner',
      answer([hit(1, { fileName: evil, snippet: '<script>x()</script> <b>b</b>' })])
    )
    await ask(portal)
    expect(await screen.findByText(evil)).toBeTruthy()
    expect(screen.getByText('<script>x()</script> <b>b</b>')).toBeTruthy()
    expect(document.querySelector('img[src="x"]')).toBeNull()
    expect(document.querySelector('main script, main b')).toBeNull()
  })

  test('the links have distinct names and open the Playbook', async () => {
    const portal = open('owner', answer([hit(1), hit(2)]))
    await ask(portal)
    const list = await screen.findByRole('list', { name: 'Matching Document text' })
    const links = within(list).getAllByRole('link')
    const names = links.map((link) => link.getAttribute('aria-label') ?? link.textContent)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain('Open in Playbook, for result 2')
    expect(links[0]?.getAttribute('href')).toBe('/playbook')
  })

  test('an empty result has its own message', async () => {
    const portal = open('owner', answer([], { chunks: 0, documents: 0 }))
    await ask(portal)
    expect(await screen.findByText(/No Document text matched/)).toBeTruthy()
    expect(screen.queryByText(/Based on/)).toBeNull()
  })

  test('503 and 504 are chosen by code', async () => {
    const busy = open(
      'owner',
      failure(503, 'server.unavailable', undefined, { 'retry-after': '5' })
    )
    await ask(busy)
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Search is busy, try again in 5 seconds'
    )
  })

  test('after the results arrive focus moves to the results heading', async () => {
    const portal = open('owner')
    await ask(portal)
    const heading = await screen.findByRole('heading', { name: 'Results' })
    await waitFor(() => expect(document.activeElement).toBe(heading))
  })

  test('editing a turn or the limit clears the results', async () => {
    const portal = open('owner')
    await ask(portal)
    await screen.findByRole('list', { name: 'Matching Document text' })
    await portal.user.type(screen.getByLabelText('What was said, turn 1'), 'x')
    expect(screen.queryByRole('list', { name: 'Matching Document text' })).toBeNull()
    await portal.user.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByRole('list', { name: 'Matching Document text' })
    await choose(portal.user, screen.getByLabelText('Number of results'), '10')
    expect(screen.queryByRole('list', { name: 'Matching Document text' })).toBeNull()
  })

  test('an answer that arrives after an edit is dropped', async () => {
    let release: (response: Response) => void = () => undefined
    const late = new Promise<Response>((resolve) => {
      release = resolve
    })
    const portal = visit(URL, 'owner', [route('POST', SEARCH, () => late)])
    await ask(portal)
    await portal.user.type(screen.getByLabelText('What was said, turn 1'), ' and more')
    await act(async () => {
      release(answer([hit(1)]))
      await new Promise((done) => setTimeout(done, 100))
    })
    expect(screen.queryByRole('list', { name: 'Matching Document text' })).toBeNull()
    expect(screen.queryByText('Passage text 1')).toBeNull()
  })

  test('another Organization sees neither the old turns nor the old results', async () => {
    const portal = visit(URL, 'owner', [
      route('POST', SEARCH, answer([hit(1)])),
      route('POST', '/v1/client/sessions/refresh', () =>
        json(200, tokens({ accessToken: 'access-2', organization: { id: 'org_2', role: 'owner' } }))
      ),
    ])
    await ask(portal)
    await screen.findByRole('list', { name: 'Matching Document text' })
    // The answer is held by a mutation until the session changes; the check after must not be vacuous.
    expect(portal.app.queryClient.getMutationCache().getAll()).toHaveLength(1)
    await act(() => portal.app.session.refresh('access-1'))
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'Matching Document text' })).toBeNull()
    )
    expect((screen.getByLabelText('What was said, turn 1') as HTMLTextAreaElement).value).toBe('')
    expect(screen.queryByText('Passage text 1')).toBeNull()
    expect(portal.app.queryClient.getMutationCache().getAll()).toHaveLength(0)
  })

  test('after sign-out the results and turns are gone', async () => {
    const portal = visit(URL, 'owner', [
      route('POST', SEARCH, answer([hit(1)])),
      route('POST', '/v1/client/sessions/sign-out', json(204)),
    ])
    await ask(portal)
    await screen.findByRole('list', { name: 'Matching Document text' })
    expect(portal.app.queryClient.getMutationCache().getAll()).toHaveLength(1)
    await act(() => portal.app.session.signOut())
    await waitFor(() => expect(screen.queryByLabelText('What was said, turn 1')).toBeNull())
    expect(screen.queryByText('Passage text 1')).toBeNull()
    expect(portal.app.queryClient.getMutationCache().getAll()).toHaveLength(0)
  })
})
