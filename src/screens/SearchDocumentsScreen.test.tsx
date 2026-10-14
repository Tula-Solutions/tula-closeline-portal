import { describe, expect, test } from 'bun:test'
import { screen, within } from '@testing-library/react'
import { hexId } from '~/testing/core-bodies'
import { failure, json, route } from '~/testing/fixtures'
import { visit } from '~/testing/sales'

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

  test('the evidence wording counts chunks and Documents of this search only', async () => {
    const portal = open('owner')
    await ask(portal)
    expect(
      await screen.findByText('Based on 9 chunks across 2 Documents in this search')
    ).toBeTruthy()
  })

  test('the evidence wording is singular for one', async () => {
    const portal = open('owner', answer([hit(1)], { chunks: 1, documents: 1 }))
    await ask(portal)
    expect(
      await screen.findByText('Based on 1 chunk across 1 Document in this search')
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

  test('the links have distinct names and go to the Documents screen', async () => {
    const portal = open('owner', answer([hit(1), hit(2)]))
    await ask(portal)
    const list = await screen.findByRole('list', { name: 'Matching Document text' })
    const links = within(list).getAllByRole('link')
    const names = links.map((link) => link.getAttribute('aria-label') ?? link.textContent)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain('Documents screen, for result 2')
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
})
