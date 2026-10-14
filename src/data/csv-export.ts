/**
 * A cell safe to put in a CSV a person will open in a spreadsheet. A value that starts with `=`,
 * `+`, `-` or `@` (or a tab or carriage return) would be read as a formula, so it gets a leading
 * apostrophe; the cell is then quoted if it holds a comma, a quote or a line break. A customer's
 * deal id may begin with any of these.
 */
export function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded
}

/** One CSV line from cells, each made safe by {@link csvCell}. */
export function csvLine(cells: readonly string[]): string {
  return `${cells.map(csvCell).join(',')}\r\n`
}
