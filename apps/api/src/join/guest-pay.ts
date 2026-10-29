import { totalDueCents, type GuestTerms } from '../trips/trip-types'

/**
 * Whether a guest may see how to pay and report a payment: never once turned down, never while on the waitlist without
 * an offer, and on an accept-first trip only once accepted (a guest on the other two pays before the organizer decides).
 */
export const canPay = (
  joinMode: string,
  g: { status: string; waitlistedAt: Date | string | null; offeredAt: Date | string | null }
) =>
  g.status !== 'declined' &&
  (g.status === 'approved' || !g.waitlistedAt || Boolean(g.offeredAt)) &&
  (joinMode !== 'accept_first' || g.status === 'approved')

/**
 * What a guest still owes: `left` is the price with the organizer's adjustments, less what was confirmed or is waiting
 * to be, and `dueNow` the rest of the first payment, which holds the spot (nothing once that is covered: later
 * installments have no dates yet), never more than is left.
 */
export function owed(terms: GuestTerms): { left: number; dueNow: number } {
  const counted = terms.paidCents + terms.pendingCents
  const left = Math.max(0, totalDueCents(terms) - counted)
  return { left, dueNow: Math.min(left, Math.max(0, terms.firstInstallmentCents - counted)) }
}
