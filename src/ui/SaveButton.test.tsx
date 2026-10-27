import { describe, expect, test } from 'bun:test'
import { act, render, screen } from '@testing-library/react'
import { SAVED_MS, SaveButton } from '~/ui/SaveButton'

function view(savedAt: number, pending = false) {
  return (
    <SaveButton pending={pending} savedAt={savedAt} pendingLabel='Saving...'>
      Save Outcome
    </SaveButton>
  )
}

describe('the save button', () => {
  test('before any save it is its label, with no check', () => {
    const { container } = render(view(0))
    const button = screen.getByRole('button', { name: 'Save Outcome' })
    expect(button.hasAttribute('data-saved')).toBe(false)
    expect(container.querySelector('.check-draw')).toBeNull()
  })

  test('a save shows "Saved" and a check, keeps its accessible name, and goes back after 1.6 s', async () => {
    const { rerender, container } = render(view(0))
    rerender(view(1))
    const button = screen.getByRole('button', { name: 'Save Outcome' })
    expect(button.hasAttribute('data-saved')).toBe(true)
    expect(button.textContent).toContain('Saved')
    expect(container.querySelector('.check-draw path')?.getAttribute('pathLength')).toBe('1')
    // The label stays in the button, so its width does not change.
    expect(button.querySelector('.opacity-0')?.textContent).toBe('Save Outcome')
    await act(() => new Promise((done) => setTimeout(done, SAVED_MS + 50)))
    expect(button.hasAttribute('data-saved')).toBe(false)
    expect(button.textContent).toBe('Save Outcome')
  })

  test('a second save restarts the "Saved" state', async () => {
    const { rerender } = render(view(1))
    await act(() => new Promise((done) => setTimeout(done, SAVED_MS - 400)))
    rerender(view(2))
    await act(() => new Promise((done) => setTimeout(done, 600)))
    expect(screen.getByRole('button').hasAttribute('data-saved')).toBe(true)
  })

  test('while a save runs it says so and is marked disabled, never "Saved"', () => {
    render(view(1, true))
    const button = screen.getByRole('button', { name: 'Saving...' })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.hasAttribute('data-saved')).toBe(false)
  })
})
