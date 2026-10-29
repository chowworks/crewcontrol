import type { PlannedPayment } from '@cc/types'

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
export function installmentLine(plan: PlannedPayment[]): string {
  const due = (p: PlannedPayment | undefined) =>
    p?.dueOn ? `${shortDate(p.dueOn)}, ${p.dueOn.slice(0, 4)}` : null
  if (plan.length <= 1) {
    const by = due(plan[0])
    return by ? `Paid in one payment, due by ${by}.` : 'Paid in one payment.'
  }
  const [first, second] = plan
  const last = plan[plan.length - 1]
  const about = last.amountCents === second.amountCents ? '' : 'about '
  const rest = plan.length - 1
  const line =
    first.amountCents === second.amountCents
      ? `Paid in ${plan.length} installments of ${about}${money(second.amountCents)}`
      : `A ${money(first.amountCents)} deposit, then ${rest} installment${rest === 1 ? '' : 's'} of ${about}${money(second.amountCents)}`
  const by = due(last)
  return by ? `${line}, the last due by ${by}.` : `${line}.`
}
