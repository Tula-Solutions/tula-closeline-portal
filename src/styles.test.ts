import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
const rule = (selector: string) =>
  css.match(new RegExp(`${selector.replace(/[.[\]"]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? ''

describe('styles', () => {
  test('a checkbox is its own size and not a full-width text field', () => {
    const body = rule('input[type="checkbox"]')
    expect(body).toMatch(/width:\s*auto/)
    expect(body).toMatch(/min-height:\s*0/)
  })

  test('the sales-history menu has room before the heading below it', () => {
    expect(rule('.sub-nav')).toMatch(/margin-bottom:\s*1\.[0-9]+rem/)
  })
})
