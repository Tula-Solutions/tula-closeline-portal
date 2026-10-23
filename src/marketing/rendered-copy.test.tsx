import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen } from '@testing-library/react'
import { renderPortal } from '~/testing/render'

const INTERNAL = /\bphase \d|\bADR[ -]?\d{2,4}|\bbuilt today\b|\bplanned\b|\broadmap\b/i

afterEach(cleanup)

describe('rendered marketing pages', () => {
  test.each([
    { url: '/' },
    { url: '/copilot' },
    { url: '/inbound-agent' },
    { url: '/outbound-agent' },
    { url: '/the-playbook' },
    { url: '/security' },
    { url: '/book-a-demo' },
  ])('$url shows no roadmap or decision-record wording', async ({ url }) => {
    renderPortal({ url })
    await screen.findAllByRole('heading', { level: 1 })
    expect(document.body.textContent ?? '').not.toMatch(INTERNAL)
  })
})
