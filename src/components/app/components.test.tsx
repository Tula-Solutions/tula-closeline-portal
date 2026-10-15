import { describe, expect, test } from 'bun:test'
import { render, screen } from '@testing-library/react'
import { EmptyState } from '~/components/app/empty-state'
import { RoleBadge } from '~/components/app/role-badge'
import { Section } from '~/components/app/section'
import { StatusBadge } from '~/components/app/status-badge'
import { initials, Monogram } from '~/components/ui/avatar'
import { NativeSelect } from '~/components/ui/native-select'

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

describe('native select', () => {
  test('stays the browser select, with its label, options and a hidden chevron', () => {
    render(
      <>
        <label htmlFor='role'>Role</label>
        <NativeSelect id='role' controlSize='sm' defaultValue='rep'>
          <option value='manager'>Manager</option>
          <option value='rep'>Rep</option>
        </NativeSelect>
      </>
    )
    const select = screen.getByLabelText('Role') as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    expect(select.value).toBe('rep')
    expect(select.className).toContain('h-9')
    const icon = document.querySelector('[data-slot="native-select-icon"]')
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
  })
})
