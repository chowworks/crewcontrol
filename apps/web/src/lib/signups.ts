import type { Guest, JoinMode } from '@cc/types'

/**
 * The sign-up line: guests whose spot is paid first, in the order their payments covered it, then guests with a
 * payment reported or confirmed (by when they joined), then everyone else, and the turned down last. First come,
 * first served; no ties to break, because two confirmations never share an instant. The waitlist comes after, in the
 * order guests joined it.
 */
export function signupOrder(guests: Guest[]): Guest[] {
  const rank = (g: Guest) =>
    g.status === 'declined'
      ? 4
      : g.status === 'interested' && g.waitlistedAt && !g.offeredAt
        ? 3
        : g.spotPaidAt
          ? 0
          : g.payments.some((p) => p.status === 'reported' || p.status === 'confirmed')
            ? 1
            : 2
  const key = (g: Guest) => g.spotPaidAt ?? g.waitlistedAt ?? g.createdAt
  return [...guests].sort((a, b) => rank(a) - rank(b) || key(a).localeCompare(key(b)))
}

/** What guests read by the sign-up button when the organizer hasn't written their own lines. */
export function defaultSignupNote(organizerName: string, joinMode: JoinMode): string {
  const o = organizerName || 'the host'
  return joinMode === 'accept_first'
    ? `Sign the trip agreement, and once ${o} accepts you, you’re on your way.`
    : 'Sign the trip agreement, pay your first installment, and you’re on your way.'
}

/**
 * Whether someone joining now goes on the waitlist, as the database decides it (trip_waitlisting, migration
 * 20261026020000_waitlist): every spot taken, or, where guests pay first, the guests who can already see how to pay
 * (waiting, not refunded, not on the waitlist unless offered a spot) fill the spots left plus the system's waitlist
 * buffer (System Settings), rounded up.
 */
export function waitlisting(
  trip: { maxGuests: number | null; joinMode: JoinMode; waitlistBufferPercent: number },
  guests: Guest[]
): boolean {
  if (trip.maxGuests === null) return false
  const spotsLeft = trip.maxGuests - guests.filter((g) => g.status === 'approved').length
  if (spotsLeft <= 0) return true
  if (trip.joinMode === 'accept_first') return false
  const inLine = guests.filter(
    (g) => g.status === 'interested' && !g.refundSentAt && (!g.waitlistedAt || g.offeredAt)
  ).length
  return inLine >= spotsLeft + Math.ceil((spotsLeft * trip.waitlistBufferPercent) / 100)
}

/** Guests waiting on the waitlist for a spot (not yet offered one), in the order they joined it. */
export function waitlist(guests: Guest[]): Guest[] {
  return guests
    .filter((g) => g.status === 'interested' && g.waitlistedAt && !g.offeredAt)
    .sort((a, b) => a.waitlistedAt!.localeCompare(b.waitlistedAt!))
}
