import type { OrganizerTrip } from '../trips/trip-types'
import { guestActions, waitlistSpotOpen } from '../trips/trip-types'

/** The kinds of Trip Control's Actions an organizer is emailed about. */
export type AlertKind = 'payment' | 'accept' | 'refund' | 'email' | 'spot' | 'receipt'

export interface AlertItem {
  key: string
  kind: AlertKind
}

/**
 * What on a trip needs its organizers and is worth an email: Trip Control's Actions (tripActionCount), less two. A
 * question has its own email the moment it's asked, and a room's new price is the organizer's own change.
 */
export function alertItems(trip: OrganizerTrip): AlertItem[] {
  const items = new Map<string, AlertItem>()
  for (const g of trip.guests)
    for (const a of guestActions(g, trip))
      // One transfer for several travelers is one action (its payments share the key).
      if (a.kind !== 'room_price') items.set(a.key, { key: a.key, kind: a.kind })
  if (waitlistSpotOpen(trip)) items.set(`${trip.id}-spot`, { key: `${trip.id}-spot`, kind: 'spot' })
  for (const r of trip.receipts.unmatched) items.set(r.id, { key: r.id, kind: 'receipt' })
  return [...items.values()]
}

const WORDS: Record<AlertKind, [string, string]> = {
  payment: ['payment to confirm', 'payments to confirm'],
  accept: ['guest to accept', 'guests to accept'],
  refund: [
    'guest to refund (they paid, but the trip is full)',
    'guests to refund (they paid, but the trip is full)',
  ],
  email: [
    'guest whose email bounced or went to spam',
    'guests whose email bounced or went to spam',
  ],
  spot: ['spot open to offer someone on the waitlist', 'spots open to offer the waitlist'],
  receipt: ['forwarded receipt to match', 'forwarded receipts to match'],
}
const ORDER: AlertKind[] = ['payment', 'accept', 'refund', 'receipt', 'spot', 'email']

/** One trip's new things in a sentence: "2 payments to confirm, 1 guest to accept." */
export function summary(items: AlertItem[]): string {
  const parts = ORDER.flatMap((kind) => {
    const n = items.filter((i) => i.kind === kind).length
    if (n === 0) return []
    return [`${n} ${WORDS[kind][n === 1 ? 0 : 1]}`]
  })
  return `${parts.join(', ')}.`
}
