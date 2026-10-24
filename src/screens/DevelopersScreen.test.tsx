import { describe, expect, test } from 'bun:test'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import { DevelopersScreen, type PublicDocument } from '~/screens/DevelopersScreen'
import { tokens } from '~/testing/fixtures'
import { renderPortal } from '~/testing/render'

const FIXTURE: PublicDocument = {
  info: { title: 'Closeline public API', version: '1.0.0' },
  paths: {
    '/v1/prospects': {
      get: {
        summary: 'List Prospects',
        description: 'One page of Prospects.',
        parameters: [{ name: 'cursor', in: 'query', description: 'From the last page.' }],
        responses: { '200': { description: 'A page of Prospects' } },
        'x-closeline-scopes': ['prospects:read'],
      },
      post: {
        summary: 'Create a Prospect',
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '201': { description: 'Created' } },
        'x-closeline-scopes': ['prospects:write'],
      },
    },
  },
}

/** Renders the page with a document of the test's choosing, in a router of its own that makes no request. */
async function renderWith(document: PublicDocument) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <DevelopersScreen document={document} /> }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('heading', { level: 1, name: 'Developers' })
}

describe('Developers: the reference', () => {
  test('renders the endpoints of the document with their scopes, parameters and responses', async () => {
    await renderWith(FIXTURE)
    const list = screen.getByRole('list', { name: 'Endpoints' })
    const get = within(list).getByText('GET /v1/prospects').closest('li') as HTMLElement
    expect(within(get).getByText('List Prospects')).toBeTruthy()
    expect(within(get).getByText('prospects:read')).toBeTruthy()
    expect(within(get).getByText('cursor')).toBeTruthy()
    expect(within(get).getByText('200')).toBeTruthy()
    const post = within(list).getByText('POST /v1/prospects').closest('li') as HTMLElement
    expect(within(post).getByText('prospects:write')).toBeTruthy()
    expect(within(post).getByText(/Request body, application\/json/)).toBeTruthy()
    expect(screen.getByText('Closeline public API')).toBeTruthy()
  })

  test('says so when no endpoint is public yet', async () => {
    await renderWith({ info: { title: 'Closeline public API' }, paths: {} })
    expect(screen.getByText(/No endpoints are open to API keys yet/)).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Endpoints' })).toBeNull()
  })

  test('shows the vendored document when none is given', async () => {
    const router = createRouter({
      routeTree: createRootRoute({ component: () => <DevelopersScreen /> }),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    render(<RouterProvider router={router} />)
    await screen.findByRole('heading', { level: 2, name: /Closeline public API/ })
  })

  test('explains how to get a token', async () => {
    await renderWith(FIXTURE)
    const guide = screen.getByRole('region', { name: 'Get a token' })
    expect(within(guide).getByText('POST /v1/token')).toBeTruthy()
    expect(within(guide).getAllByText(/10 minutes/).length).toBeGreaterThan(0)
    expect(within(guide).getByRole('link', { name: 'API keys' }).getAttribute('href')).toBe(
      '/api-keys'
    )
  })
})

describe('Developers: no private call', () => {
  test('opening the page in the portal asks only for the session reads, never for keys', async () => {
    const portal = renderPortal({
      url: '/developers',
      signedIn: tokens({ organization: { id: 'org_1', role: 'rep' } }),
      handlers: [],
    })
    await screen.findByRole('heading', { level: 1, name: 'Developers' })
    await waitFor(() => expect(screen.getByText(/No endpoints are open|Endpoints/)).toBeTruthy())
    const paths = portal.calls.map((call) => call.path)
    expect(paths.some((path) => path.startsWith('/v1/api-keys'))).toBe(false)
    expect(paths.some((path) => path.includes('openapi'))).toBe(false)
    expect(portal.calls.every((call) => call.method === 'GET')).toBe(true)
  })
})
