import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { hexId } from '~/testing/core-bodies'
import { failure, type Handler, json, route, tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const QUESTIONS = '/v1/agent/questions'
const ORDER = '/v1/agent/question-order'
const id = (n: number) => hexId('qst', n)

const question = (n: number, prompt: string, extra: Record<string, unknown> = {}) => ({
  id: id(n),
  position: n,
  prompt,
  kind: 'free_text',
  choices: null,
  required: true,
  skipWhen: [],
  ...extra,
})
const seed = () => [
  question(1, 'What is your budget?'),
  question(2, 'Who decides?'),
  question(3, 'When do you need it?'),
]
const empty = json(200, { items: [], nextCursor: null })
const quiet: Handler[] = [
  route('GET', '/v1/agent-controls', empty),
  route(
    'GET',
    '/v1/agent-controls/organization-pause',
    json(200, { paused: false, updatedAt: null, updatedByMembershipId: null })
  ),
  route('GET', '/v1/agent-instructions/inbound/versions', empty),
  route(
    'GET',
    '/v1/agent-instructions/inbound/published',
    json(404, { error: { code: 'agent.version_not_found', message: 'x' } })
  ),
]
/** A list that follows the order last sent, as the server would. */
const list = (items = seed()): Handler => {
  let current = items
  return (call) => {
    if (call.method === 'PUT' && call.path === ORDER) {
      const ids = (call.body as { questionIds: string[] }).questionIds
      const before = current
      current = ids.flatMap((qid, at) => {
        const found = before.find((item) => item.id === qid)
        return found ? [{ ...found, position: at + 1 }] : []
      })
      return json(200, {})
    }
    return call.method === 'GET' && call.path === QUESTIONS
      ? json(200, { items: current, nextCursor: null })
      : null
  }
}

function visit(role: 'owner' | 'admin' | 'manager' | 'rep', ...handlers: Handler[]) {
  return renderPortal({
    url: '/agent',
    signedIn: tokens({ organization: { id: 'org_1', role } }),
    handlers: [...handlers, ...quiet],
  })
}
const order = (portal: { calls: readonly { method: string; path: string; body: unknown }[] }) =>
  portal.calls.find((call) => call.method === 'PUT' && call.path === ORDER)

afterEach(() => {
  document.documentElement.classList.remove('dark')
  cleanup()
})

describe('Agent questions: who can use them', () => {
  test('a Rep sends no request', async () => {
    const portal = visit('rep', list())
    await screen.findByText(/Only an Owner, Admin or Manager/)
    expect(portal.calls.filter((call) => call.path.startsWith('/v1/agent/'))).toHaveLength(0)
  })

  test('a Manager reads the questions and has no buttons to change them', async () => {
    const portal = visit('manager', list())
    const items = await screen.findByRole('list', { name: 'Qualification questions' })
    expect(within(items).getAllByRole('listitem')).toHaveLength(3)
    expect(
      screen.queryByRole('button', { name: /add a question|move|edit question|delete/i })
    ).toBeNull()
    expect(portal.calls.every((call) => call.method === 'GET')).toBe(true)
  })

  test.each(['owner', 'admin'] as const)('%s can add and move', async (role) => {
    visit(role, list())
    await screen.findByRole('list', { name: 'Qualification questions' })
    expect(screen.getByRole('button', { name: 'Add a question' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Move question 1 down' })).toBeTruthy()
  })
})

describe('Agent questions: create, edit, delete', () => {
  test('creates a question with an idempotency key', async () => {
    const portal = visit(
      'owner',
      route('POST', QUESTIONS, json(201, question(4, 'Any blockers?'))),
      list()
    )
    await screen.findByRole('list', { name: 'Qualification questions' })
    await portal.user.click(screen.getByRole('button', { name: 'Add a question' }))
    await portal.user.type(screen.getByLabelText(/^Question/), 'Any blockers?')
    await portal.user.click(screen.getByRole('button', { name: 'Add question' }))
    await screen.findByText('Question added.')
    const post = portal.calls.find((call) => call.method === 'POST')
    expect(post?.body).toMatchObject({ prompt: 'Any blockers?', kind: 'free_text', required: true })
    expect(post?.headers.get('idempotency-key')).toBeTruthy()
  })

  test('shows the code text when the API refuses a question', async () => {
    const portal = visit(
      'owner',
      route('POST', QUESTIONS, failure(422, 'agent.question_invalid')),
      list()
    )
    await screen.findByRole('list', { name: 'Qualification questions' })
    await portal.user.click(screen.getByRole('button', { name: 'Add a question' }))
    await portal.user.type(screen.getByLabelText(/^Question/), 'Any blockers?')
    await portal.user.click(screen.getByRole('button', { name: 'Add question' }))
    expect(await screen.findByText(/skip logic looks at a question that is missing/)).toBeTruthy()
  })

  test('refuses an empty question before anything is sent', async () => {
    const portal = visit('owner', list())
    await screen.findByRole('list', { name: 'Qualification questions' })
    await portal.user.click(screen.getByRole('button', { name: 'Add a question' }))
    await portal.user.click(screen.getByRole('button', { name: 'Add question' }))
    await screen.findByText(/Check the question/)
    expect(portal.calls.some((call) => call.method === 'POST')).toBe(false)
  })

  test('edits a question with a patch', async () => {
    const portal = visit(
      'admin',
      route('PATCH', `${QUESTIONS}/${id(2)}`, json(200, question(2, 'Who signs?'))),
      list()
    )
    await screen.findByRole('list', { name: 'Qualification questions' })
    await portal.user.click(screen.getByRole('button', { name: 'Edit question 2' }))
    const field = screen.getByLabelText(/^Question/)
    await portal.user.clear(field)
    await portal.user.type(field, 'Who signs?')
    await portal.user.click(screen.getByRole('button', { name: 'Save question' }))
    await screen.findByText('Question saved.')
    const patch = portal.calls.find((call) => call.method === 'PATCH')
    expect(patch?.body).toMatchObject({ prompt: 'Who signs?' })
  })

  test('deletes a question after confirming', async () => {
    const portal = visit('owner', route('DELETE', `${QUESTIONS}/${id(2)}`, json(204)), list())
    await screen.findByRole('list', { name: 'Qualification questions' })
    await portal.user.click(screen.getByRole('button', { name: 'Delete question 2' }))
    await portal.user.click(screen.getByRole('button', { name: 'Delete question' }))
    await screen.findByText('Question deleted.')
    expect(portal.calls.some((call) => call.method === 'DELETE')).toBe(true)
  })

  test('shows the code text when a question is already gone', async () => {
    const portal = visit(
      'owner',
      route('DELETE', `${QUESTIONS}/${id(2)}`, failure(404, 'agent.question_not_found')),
      list()
    )
    await screen.findByRole('list', { name: 'Qualification questions' })
    await portal.user.click(screen.getByRole('button', { name: 'Delete question 2' }))
    await portal.user.click(screen.getByRole('button', { name: 'Delete question' }))
    expect(await screen.findByText(/That question no longer exists/)).toBeTruthy()
  })
})

const prompts = () =>
  within(screen.getByRole('list', { name: 'Qualification questions' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent ?? '')

describe('Agent questions: reorder', () => {
  test('moves a question down with the button, sends the order and announces it', async () => {
    const portal = visit('owner', list())
    await screen.findByRole('list', { name: 'Qualification questions' })
    await portal.user.click(screen.getByRole('button', { name: 'Move question 1 down' }))
    await waitFor(() => expect(order(portal)).toBeTruthy())
    expect(order(portal)?.body).toEqual({ questionIds: [id(2), id(1), id(3)] })
    await waitFor(() => expect(prompts()[0]).toContain('Who decides?'))
    expect(screen.getByText(/moved to position 2 of 3/)).toBeTruthy()
    expect(
      portal.calls.find((call) => call.path === ORDER)?.headers.get('idempotency-key')
    ).toBeTruthy()
  })

  test('the first Move up does nothing', async () => {
    const portal = visit('owner', list())
    await screen.findByRole('list', { name: 'Qualification questions' })
    await portal.user.click(screen.getByRole('button', { name: 'Move question 1 up' }))
    expect(order(portal)).toBeUndefined()
  })

  test('drag and drop moves a row', async () => {
    const portal = visit('owner', list())
    await screen.findByRole('list', { name: 'Qualification questions' })
    const rows = within(screen.getByRole('list', { name: 'Qualification questions' })).getAllByRole(
      'listitem'
    )
    const row = (n: number) => rows[n] as HTMLElement
    const data = { setData: () => undefined, effectAllowed: '' }
    fireEvent.dragStart(row(2), { dataTransfer: data })
    fireEvent.dragOver(row(0), { dataTransfer: data })
    fireEvent.drop(row(0), { dataTransfer: data })
    await waitFor(() => expect(order(portal)).toBeTruthy())
    expect(order(portal)?.body).toEqual({ questionIds: [id(3), id(1), id(2)] })
  })

  test('puts the list back and says why when the move is refused', async () => {
    const portal = visit(
      'owner',
      route('PUT', ORDER, failure(422, 'agent.question_invalid')),
      list()
    )
    await screen.findByRole('list', { name: 'Qualification questions' })
    await portal.user.click(screen.getByRole('button', { name: 'Move question 1 down' }))
    expect(await screen.findByText(/skip logic looks at a question that is missing/)).toBeTruthy()
    await waitFor(() => expect(prompts()[0]).toContain('What is your budget?'))
  })
})

describe('Agent questions: a refused move', () => {
  test('shows the server list again, not the snapshot, when a delete landed meanwhile', async () => {
    let reads = 0
    const portal = visit(
      'owner',
      route('PUT', ORDER, failure(422, 'agent.question_invalid')),
      (call) => {
        if (call.method !== 'GET' || call.path !== QUESTIONS) {
          return null
        }
        reads += 1
        return json(200, { items: reads === 1 ? seed() : seed().slice(1), nextCursor: null })
      }
    )
    await screen.findByRole('list', { name: 'Qualification questions' })
    await portal.user.click(screen.getByRole('button', { name: 'Move question 2 down' }))
    await screen.findByText(/skip logic looks at a question that is missing/)
    await waitFor(() => expect(prompts()).toHaveLength(2))
  })
})

describe('Agent questions: accessibility', () => {
  test.each(['light', 'dark'] as const)('passes axe in %s with a form open', async (theme) => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    }
    const portal = visit('owner', list())
    await screen.findByRole('list', { name: 'Qualification questions' })
    await portal.user.click(screen.getByRole('button', { name: 'Edit question 2' }))
    const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
    expect(result.violations.map((violation) => violation.id)).toEqual([])
  })
})
