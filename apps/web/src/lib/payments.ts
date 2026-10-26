import type { GuestTerms, Payment } from '@cc/types'

/** "$1,200.50" or "1200.5" → 120050; anything that isn't a positive amount → 0. */
export function centsFrom(text: string): number {
  const n = Number(text.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0
}

/** 120050 → "1200.50", for an amount box. */
export const dollarsFor = (cents: number) => (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)

/**
 * What a guest still owes, as the API counts it (JoinService.owed): `left` is the price less what was confirmed or is
 * waiting to be, and `dueNow` the rest of the first payment, which holds the spot.
 */
export function owed(terms: GuestTerms): { left: number; dueNow: number } {
  const counted = terms.paidCents + terms.pendingCents
  return {
    left: Math.max(0, terms.priceCents - counted),
    dueNow: Math.max(0, terms.firstInstallmentCents - counted),
  }
}

/**
 * What was due when a payment was reported, as the guest saw it then: the first payment, less what they had already
 * reported or had confirmed before this one (payments not received don't count). Zero once the spot was covered.
 */
export function dueWhenSent(payment: Payment, payments: Payment[], terms: GuestTerms): number {
  const before = payments
    .filter((p) => p.reportedAt < payment.reportedAt && p.id !== payment.id)
    .reduce(
      (n, p) =>
        n +
        (p.status === 'confirmed'
          ? (p.receivedPaymentAmount ?? 0)
          : p.status === 'reported'
            ? p.guestPaymentAmount
            : 0),
      0
    )
  return Math.max(0, terms.firstInstallmentCents - before)
}

/** Today as 'YYYY-MM-DD' in the viewer's own time zone. */
export function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Where a payment stands, in a few words; `waitingOn` is who confirms it ("Simone", or "you" for the organizer). */
export function paymentStatus(status: Payment['status'], waitingOn: string): string {
  return status === 'reported'
    ? `Waiting for ${waitingOn}`
    : { confirmed: 'Confirmed', not_received: 'Not received', refunded: 'Refunded' }[status]
}
