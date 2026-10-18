const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LONG_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function parts(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return { y, m: m - 1, d }
}

/** 120000 → "$1,200"; 120050 → "$1,200.50". */
export function money(cents: number): string {
  const dollars = cents / 100
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  })
}

/** '2027-06-18' → "Jun 18". Dates are calendar days, so no time zone is involved. */
export function shortDate(date: string): string {
  const { m, d } = parts(date)
  return `${MONTHS[m]} ${d}`
}

/** A trip's span: "June 18–21, 2027", "June 30–July 2, 2027" or "December 30, 2027–January 2, 2028". */
export function dateRange(start: string, end: string): string {
  const a = parts(start)
  const b = parts(end)
  if (a.y !== b.y) return `${LONG_MONTHS[a.m]} ${a.d}, ${a.y}–${LONG_MONTHS[b.m]} ${b.d}, ${b.y}`
  if (a.m !== b.m) return `${LONG_MONTHS[a.m]} ${a.d}–${LONG_MONTHS[b.m]} ${b.d}, ${a.y}`
  if (a.d === b.d) return `${LONG_MONTHS[a.m]} ${a.d}, ${a.y}`
  return `${LONG_MONTHS[a.m]} ${a.d}–${b.d}, ${a.y}`
}

/** How the cost is split: "Paid in 4 installments of $300." */
export function installmentLine(costCents: number, count: number): string {
  if (count <= 1) return 'Paid in one payment.'
  const each = Math.floor(costCents / count)
  const last = costCents - each * (count - 1)
  return each === last
    ? `Paid in ${count} installments of ${money(each)}.`
    : `Paid in ${count} installments of about ${money(each)}.`
}
