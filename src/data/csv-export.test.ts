import { describe, expect, test } from 'bun:test'
import { csvCell, csvLine } from '~/data/csv-export'

describe('csvCell', () => {
  test.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx'])(
    'a value that starts like a formula (%j) gets a leading apostrophe',
    (value) => {
      expect(csvCell(value).replace(/^"/, '').startsWith("'")).toBe(true)
    }
  )

  test('a plain value is unchanged', () => {
    expect(csvCell('D-100')).toBe('D-100')
    expect(csvCell('a=b')).toBe('a=b')
  })

  test('commas, quotes and line breaks are quoted, and a quote is doubled', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('a\nb')).toBe('"a\nb"')
  })

  test('a formula that also needs quoting is made safe first, then quoted', () => {
    expect(csvCell('=A1,B1')).toBe(`"'=A1,B1"`)
  })

  test('a line ends with CRLF', () => {
    expect(csvLine(['1', '=x'])).toBe("1,'=x\r\n")
  })
})
