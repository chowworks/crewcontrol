import type { Guest } from '@cc/types'

/**
 * The sign-up line: confirmed payments first, in the order the organizer confirmed them, then guests who say
 * they've paid (by when they registered), then everyone else. First come, first served; no ties to break,
 * because two confirmations never share an instant.
 */
export function signupOrder(guests: Guest[]): Guest[] {
  const rank = (g: Guest) => (g.paymentConfirmedAt ? 0 : g.paymentSentAt ? 1 : 2)
  const key = (g: Guest) => g.paymentConfirmedAt ?? g.createdAt
  return [...guests].sort((a, b) => rank(a) - rank(b) || key(a).localeCompare(key(b)))
}
