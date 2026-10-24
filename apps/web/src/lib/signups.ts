import type { Guest, JoinMode } from '@cc/types'

/**
 * The sign-up line: confirmed payments first, in the order the organizer confirmed them, then guests who say
 * they've paid (by when they joined), then everyone else, and the turned down last. First come, first served; no
 * ties to break, because two confirmations never share an instant.
 */
export function signupOrder(guests: Guest[]): Guest[] {
  const rank = (g: Guest) =>
    g.status === 'declined' ? 3 : g.paymentConfirmedAt ? 0 : g.paymentSentAt ? 1 : 2
  const key = (g: Guest) => g.paymentConfirmedAt ?? g.createdAt
  return [...guests].sort((a, b) => rank(a) - rank(b) || key(a).localeCompare(key(b)))
}

/** What guests read by the sign-up button when the organizer hasn't written their own lines. */
export function defaultSignupNote(organizerName: string, joinMode: JoinMode): string {
  const o = organizerName || 'the host'
  return joinMode === 'accept_first'
    ? `Sign the trip agreement, and once ${o} accepts you, you’re on your way.`
    : 'Sign the trip agreement, pay your first installment, and you’re on your way.'
}
