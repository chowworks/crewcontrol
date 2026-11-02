// The trip editor's pricing math (issue #65) and payment-date math. Money is integer cents.

/** Cents up to the next whole dollar: a split price never leaves the organizer a few cents short. */
const upToDollar = (cents: number) => Math.ceil(cents / 100) * 100

/**
 * Split the total evenly: what each guest pays once the organizer's own part is off the top, rounded up to the dollar.
 * Zero when there is nothing left to split or nobody to split it among.
 */
export function evenSplit(totalCents: number, ownPartCents: number, guests: number): number {
  const rest = totalCents - ownPartCents
  return rest > 0 && guests > 0 ? upToDollar(rest / guests) : 0
}

/** Price by room: what the trip collects with every room full, each place at its room's price. */
export const fullRooms = (rooms: { capacity: number; priceCents?: number | null }[]) =>
  rooms.reduce((n, r) => n + r.capacity * (r.priceCents ?? 0), 0)

/** "Start from an even split": the total over every place in every room, rounded up to the dollar. */
export function evenRoomPrice(totalCents: number, rooms: { capacity: number }[]): number {
  const places = rooms.reduce((n, r) => n + r.capacity, 0)
  return totalCents > 0 && places > 0 ? upToDollar(totalCents / places) : 0
}

/**
 * `n` due dates from `first` to `last`, spaced evenly (issue #12). When the two fall on the same day of the month and
 * the months divide evenly, the dates do too ("the 1st of every other month"); otherwise they're spaced by days.
 */
export function spreadDates(first: string, last: string, n: number): string[] {
  const count = Math.max(1, Math.floor(n))
  if (count === 1) return [first]
  const [y1, m1, d1] = first.split('-').map(Number)
  const [y2, m2, d2] = last.split('-').map(Number)
  const months = (y2 - y1) * 12 + (m2 - m1)
  if (d1 === d2 && months > 0 && months % (count - 1) === 0)
    return Array.from({ length: count }, (_, i) => addMonths(first, (months / (count - 1)) * i))
  const start = Date.parse(`${first}T00:00:00Z`)
  const span = Date.parse(`${last}T00:00:00Z`) - start
  return Array.from({ length: count }, (_, i) =>
    new Date(start + Math.round((span * i) / (count - 1) / 86_400_000) * 86_400_000)
      .toISOString()
      .slice(0, 10)
  )
}

/** 'YYYY-MM-DD' plus whole months, clamped to the end of a shorter month. */
function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const total = y * 12 + (m - 1) + months
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const day = Math.min(d, last)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
