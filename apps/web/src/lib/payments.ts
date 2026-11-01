import { totalDueCents, type GuestTerms, type Payment } from '@cc/types'

/** "$1,200.50" or "1200.5" → 120050; anything that isn't a positive amount → 0. */
export function centsFrom(text: string): number {
  const n = Number(text.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0
}

/** 120050 → "1200.50", for an amount box. */
export const dollarsFor = (cents: number) => (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)

/**
 * What a guest still owes, as the API counts it (JoinService.owed): `left` is the price with the organizer's
 * adjustments, less what was confirmed or is waiting to be, and `dueNow` the rest of the first payment, which holds
 * the spot, never more than is left.
 */
export function owed(terms: GuestTerms): { left: number; dueNow: number } {
  const counted = terms.paidCents + terms.pendingCents
  const left = Math.max(0, totalDueCents(terms) - counted)
  return { left, dueNow: Math.min(left, Math.max(0, terms.firstInstallmentCents - counted)) }
}

// What a guest owes in all, the signed price with the adjustments that count: shared with the API (packages/types).
export { totalDueCents } from '@cc/types'

// What was due when a payment was reported: shared with the API (packages/types).
export { dueWhenSent } from '@cc/types'

/**
 * A confirmed payment of the same amount sent within three days: most likely the same money, so counting another asks
 * first (owner's decision, 2026-11-01, after a logged payment and the guest's own report were both confirmed).
 */
export function confirmedLookalike(
  payments: Payment[],
  amountCents: number,
  sentOn: string,
  exceptId?: string
): Payment | null {
  const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000
  return (
    payments.find(
      (p) =>
        p.id !== exceptId &&
        p.status === 'confirmed' &&
        (p.receivedPaymentAmount ?? p.guestPaymentAmount) === amountCents &&
        Math.abs(day(p.sentOn) - day(sentOn)) <= 3
    ) ?? null
  )
}

/**
 * What was taken back stays out of the transaction lists (owner's decisions, 2026-11-01): a payment an organizer
 * logged and then removed, a credit or charge they removed, and a payment marked not received that was a duplicate (a
 * confirmed one for the same amount within three days). Used as a filter callback, so it sees the guest's other
 * payments. A payment that really didn't arrive still shows. The guest's history still records them all.
 */
export const shown = {
  payment: (p: Payment, _i?: number, all: Payment[] = []) =>
    p.status !== 'not_received' ||
    (p.loggedBy !== 'organizer' && !confirmedLookalike(all, p.guestPaymentAmount, p.sentOn, p.id)),
  adjustment: (a: { removedAt: string | null }) => !a.removedAt,
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
