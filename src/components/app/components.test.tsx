import { describe, expect, test } from 'bun:test'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { EmptyState } from '~/components/app/empty-state'
import { RoleBadge } from '~/components/app/role-badge'
import { Section } from '~/components/app/section'
import { StatusBadge } from '~/components/app/status-badge'
import { initials, Monogram } from '~/components/ui/avatar'
import { Select } from '~/components/ui/select'

describe('avatar', () => {
  test('initials come from the first and last words, or from the part of an address before @', () => {
    expect(initials('Maya Chen')).toBe('MC')
    expect(initials('maya')).toBe('M')
    expect(initials('rita.rep@northline.app')).toBe('RR')
    expect(initials('  olive   de  owner ')).toBe('OO')
    expect(initials('élodie durand')).toBe('ÉD')
  })

  test('markup and direction overrides never reach the initials; nothing readable gives ?', () => {
    expect(initials('<img src=x onerror=alert(1)>')).toBe('IO')
    expect(initials(`${String.fromCharCode(0x202e)}gpj`)).toBe('G')
    expect(initials('<>')).toBe('?')
    expect(initials('')).toBe('?')
  })

  test('the monogram is the initials, hidden from assistive technology', () => {
    const { container } = render(<Monogram name='Maya Chen' />)
    const mark = container.querySelector('[data-slot="monogram"]')
    expect(mark?.getAttribute('aria-hidden')).toBe('true')
    expect(mark?.textContent).toBe('MC')
  })
})

describe('badges', () => {
  test('a role badge says the role, with nothing else in its text', () => {
    render(<RoleBadge value='admin' />)
    expect(screen.getByText('Admin').textContent).toBe('Admin')
  })

  test('a status is the word with a hidden dot in its tone, and nothing that moves', () => {
    const { container, rerender } = render(<StatusBadge state='processing'>Processing</StatusBadge>)
    const dot = container.querySelector('[data-slot="status-dot"]')
    expect(dot?.getAttribute('aria-hidden')).toBe('true')
    expect(dot?.className).toContain('bg-info')
    expect(container.querySelector('[class*="animate-"]')).toBeNull()
    rerender(<StatusBadge state='mystery'>Mystery</StatusBadge>)
    expect(container.querySelector('[data-slot="status-dot"]')?.className).toContain(
      'bg-muted-foreground'
    )
    expect(screen.getByText('Mystery').textContent).toBe('Mystery')
  })
})

describe('section', () => {
  test('is a region named by its h2 heading', () => {
    render(
      <Section id='invite' title='Invite someone' description='They get an email.'>
        <p>body</p>
      </Section>
    )
    const region = screen.getByRole('region', { name: 'Invite someone' })
    expect(region.querySelector('h2')?.id).toBe('invite-heading')
    expect(screen.getByText('They get an email.')).toBeTruthy()
  })
})

describe('empty state', () => {
  test('shows the title, one line of help and the action, with no icon', () => {
    const { container } = render(
      <EmptyState title='No Teams yet' action={<button type='button'>Create</button>}>
        Create the first one.
      </EmptyState>
    )
    expect(screen.getByText('No Teams yet')).toBeTruthy()
    expect(screen.getByText('Create the first one.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy()
    expect(container.querySelector('svg')).toBeNull()
  })
})

describe('select', () => {
  function Harness(props: { readonly onChange: (value: string) => void }) {
    const [value, setValue] = useState('rep')
    return (
      <>
        <label htmlFor='role'>Role</label>
        <Select
          id='role'
          controlSize='sm'
          value={value}
          options={[
            { value: '', text: 'Anyone' },
            { value: 'manager', text: 'Manager' },
            { value: 'rep', text: 'Rep' },
          ]}
          onValueChange={(next) => {
            setValue(next)
            props.onChange(next)
          }}
        />
      </>
    )
  }

  test('is labelled, shows the chosen words, and lists options with a check on the chosen one', async () => {
    const user = userEvent.setup()
    render(<Harness onChange={() => {}} />)
    const trigger = screen.getByLabelText('Role')
    expect(trigger.getAttribute('role')).toBe('combobox')
    expect(trigger.textContent).toContain('Rep')
    expect(trigger.className).toContain('h-9')
    await user.click(trigger)
    const options = await screen.findAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Anyone', 'Manager', 'Rep'])
    expect(screen.getByRole('option', { name: 'Rep' }).getAttribute('aria-selected')).toBe('true')
  })

  test('chooses with the pointer, and an empty-valued option is choosable', async () => {
    const user = userEvent.setup()
    const seen: string[] = []
    render(<Harness onChange={(value) => seen.push(value)} />)
    await user.click(screen.getByLabelText('Role'))
    await user.click(await screen.findByRole('option', { name: 'Manager' }))
    await user.click(screen.getByLabelText('Role'))
    await user.click(await screen.findByRole('option', { name: 'Anyone' }))
    expect(seen).toEqual(['manager', ''])
    expect(screen.getByLabelText('Role').textContent).toContain('Anyone')
  })

  test('chooses with the keyboard: arrows move, Enter chooses, Esc closes without choosing', async () => {
    const user = userEvent.setup()
    const seen: string[] = []
    render(<Harness onChange={(value) => seen.push(value)} />)
    screen.getByLabelText('Role').focus()
    await user.keyboard('{ArrowDown}')
    await screen.findByRole('listbox')
    await user.keyboard('{ArrowUp}{Enter}')
    expect(seen).toEqual(['manager'])
    await user.keyboard('{ArrowDown}')
    await screen.findByRole('listbox')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(seen).toEqual(['manager'])
  })
})
