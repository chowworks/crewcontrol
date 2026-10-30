/**
 * Spreadsheet downloads (owner's decision, 2026-10-26): CSV, which Excel, Numbers and Google Sheets all open, built
 * in the browser from what the screen already shows, so an export never holds more than the organizer can see.
 */

export type Cell = string | number | null

/**
 * One cell. A value a spreadsheet would read as a formula (guests type notes and names) is kept as text with a
 * leading apostrophe, so opening the file never runs anything.
 */
function cell(v: Cell): string {
  if (v === null) return ''
  let s = String(v)
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Cell[][]): string {
  return rows.map((r) => r.map(cell).join(',')).join('\r\n')
}

/** Cents as a plain number a spreadsheet can add up: 30050 → "300.50". */
export const amount = (cents: number | null) => (cents === null ? null : (cents / 100).toFixed(2))

/** An ISO time as "2026-10-26 14:05" in the viewer's own time zone. */
export function stamp(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** The rows as a file's text. The byte-order mark makes Excel read accents and curly quotes right. */
export const csvText = (rows: Cell[][]) => '\ufeff' + toCsv(rows)

/** Saves the rows as `name`.csv. */
export function downloadCsv(name: string, rows: Cell[][]): void {
  saveFile(`${name}.csv`, new Blob([csvText(rows)], { type: 'text/csv;charset=utf-8' }))
}

/** Hands the browser a file to save. */
export function saveFile(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** "Simone's 40th in Tulum" → "simones-40th-in-tulum", for file names. */
export const fileSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
