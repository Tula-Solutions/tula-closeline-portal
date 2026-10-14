import { describe, expect, test } from 'bun:test'
import { render, screen } from '@testing-library/react'
import { Inbox } from 'lucide-react'
import { EmptyState } from '~/components/app/empty-state'
import { RoleBadge } from '~/components/app/role-badge'
import { Section } from '~/components/app/section'
import { statText } from '~/components/app/stat-tile'
import { StatusBadge } from '~/components/app/status-badge'
import { Avatar, initials, toneIndex } from '~/components/ui/avatar'
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

  test('the fill is the same for the same key, and the avatar is hidden from assistive technology', () => {
    expect(toneIndex('mem_1')).toBe(toneIndex('mem_1'))
    const { container } = render(<Avatar name='Maya Chen' toneKey='mem_1' />)
    const mark = container.querySelector('[data-slot="avatar"]')
    expect(mark?.getAttribute('aria-hidden')).toBe('true')
    expect(mark?.textContent).toBe('MC')
  })
})

describe('badges', () => {
  test('a role badge says the role, with nothing else in its text', () => {
    render(<RoleBadge value='admin' />)
    expect(screen.getByText('Admin').textContent).toBe('Admin')
  })

  test('a status badge carries a hidden dot that pulses only for a moving state', () => {
    const { container, rerender } = render(<StatusBadge state='processing'>Processing</StatusBadge>)
    const dot = container.querySelector('[data-slot="badge-dot"]')
    expect(dot?.getAttribute('aria-hidden')).toBe('true')
    expect(dot?.querySelectorAll('span')).toHaveLength(2)
    rerender(<StatusBadge state='ready'>Ready</StatusBadge>)
    expect(
      container.querySelector('[data-slot="badge-dot"]')?.querySelectorAll('span')
    ).toHaveLength(1)
    expect(screen.getByText('Ready').textContent).toBe('Ready')
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
  test('shows the title, one line of help and the action', () => {
    render(
      <EmptyState icon={Inbox} title='No Teams yet' action={<button type='button'>Create</button>}>
        Create the first one.
      </EmptyState>
    )
    expect(screen.getByText('No Teams yet')).toBeTruthy()
    expect(screen.getByText('Create the first one.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy()
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

describe('stat text', () => {
  test('a count with more pages gets a +, and anything not counted is a dash', () => {
    expect(statText({ kind: 'count', count: 25, more: true })).toBe('25+')
    expect(statText({ kind: 'count', count: 0, more: false })).toBe('0')
    expect(statText({ kind: 'loading' })).toBe('-')
    expect(statText({ kind: 'unavailable' })).toBe('-')
  })
})
