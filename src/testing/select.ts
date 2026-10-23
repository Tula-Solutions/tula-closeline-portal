import { screen, waitFor, within } from '@testing-library/react'
import type userEvent from '@testing-library/user-event'

type User = ReturnType<typeof userEvent.setup>

/** The value a select holds, as a native select's `.value` would give it ('' when none matches). */
export function chosenValue(field: HTMLElement): string {
  return field.getAttribute('data-value') ?? ''
}

/** The words a select shows for its chosen option. */
export function shownBy(field: HTMLElement): string {
  return (field.textContent ?? '').trim()
}

/** Opens a select and returns its options (value and words); `keepOpen` leaves the list open. */
export async function optionsOf(
  user: User,
  field: HTMLElement,
  keepOpen = false
): Promise<{ value: string; text: string }[]> {
  if (screen.queryByRole('listbox') === null) {
    await user.click(field)
  }
  const list = await screen.findByRole('listbox')
  const options = within(list)
    .getAllByRole('option')
    .map((option) => ({
      value: option.getAttribute('data-value') ?? '',
      text: (option.textContent ?? '').trim(),
    }))
  if (!keepOpen) {
    await user.keyboard('{Escape}')
  }
  return options
}

/** Chooses an option of a select by its value or its words, as `selectOptions` did. */
export async function choose(user: User, field: HTMLElement, wanted: string): Promise<void> {
  if (screen.queryByRole('listbox') === null) {
    await user.click(field)
  }
  const list = await screen.findByRole('listbox')
  const match = await waitFor(
    () => {
      const options = within(list).getAllByRole('option')
      const found =
        options.find((option) => option.getAttribute('data-value') === wanted) ??
        options.find((option) => (option.textContent ?? '').trim() === wanted)
      if (found === undefined) {
        throw new Error(`No option "${wanted}" in the list`)
      }
      return found
    },
    { timeout: 3000 }
  )
  await user.click(match)
}

/** Opens a searchable combobox and chooses the option with these words. */
export async function pickFrom(user: User, field: HTMLElement, wanted: string): Promise<void> {
  await user.click(field)
  await user.click(await screen.findByRole('option', { name: wanted }, { timeout: 3000 }))
}
