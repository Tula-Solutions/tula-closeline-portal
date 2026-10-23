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

  test('a stacking ledger turns its rows into blocks below the md width, and nowhere else', () => {
    const phone = css.match(/@media \(width < 48rem\) \{([\s\S]*?)\n {2}\}\n/)?.[1] ?? ''
    expect(phone).toMatch(/\.ledger-stack tr\s*\{[^}]*display:\s*grid/)
    expect(phone).toMatch(/\.ledger-stack thead\s*\{[^}]*display:\s*none/)
    expect(phone).toMatch(/\.ledger-stack \.ledger-detail\s*\{[^}]*display:\s*none/)
    expect(css.replace(phone, '')).not.toMatch(/\.ledger-stack tr/)
  })
})
