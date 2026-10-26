import { describe, expect, it } from 'vitest'
import { amount, fileSlug, toCsv } from './csv'

describe('spreadsheet export', () => {
  it('quotes commas, quotes and line breaks, and leaves plain values alone', () => {
    expect(toCsv([['a', 'b, c', 'say "hi"', 'two\nlines', 3, null]])).toBe(
      'a,"b, c","say ""hi""","two\nlines",3,'
    )
  })

  it('keeps text a spreadsheet would run as a formula as plain text', () => {
    expect(toCsv([['=HYPERLINK("x")', '+1', '-2', '@x', 'fine']])).toBe(
      `"'=HYPERLINK(""x"")",'+1,'-2,'@x,fine`
    )
    // Numbers stay numbers.
    expect(toCsv([[-2]])).toBe('-2')
  })

  it('writes amounts a spreadsheet can add up, and file names without odd characters', () => {
    expect(amount(30050)).toBe('300.50')
    expect(amount(null)).toBeNull()
    expect(fileSlug("Simone's 40th in Tulum")).toBe('simones-40th-in-tulum')
  })
})
