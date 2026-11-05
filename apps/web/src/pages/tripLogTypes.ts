import type { GuestEvent, TripLogEntry } from '@cc/types'

// The trip log's filter: which type each line is, so an organizer can show only the types they tick (payments,
// guests, trip changes, communications).

export type LogType = 'payments' | 'guests' | 'changes' | 'comms'

export const LOG_TYPES: { value: LogType; label: string }[] = [
  { value: 'payments', label: 'Payments' },
  { value: 'guests', label: 'Guests' },
  { value: 'changes', label: 'Trip changes' },
  { value: 'comms', label: 'Communications' },
]

const PAYMENT_EVENTS: GuestEvent['kind'][] = [
  'said_paid',
  'payment_confirmed',
  'payment_not_received',
  'payment_undone',
  'refund_sent',
  'refund_undone',
  'credit_added',
  'charge_added',
  'credit_removed',
  'charge_removed',
]

/** The type a log line belongs to. */
export function logType(e: TripLogEntry): LogType {
  switch (e.kind) {
    case 'guest':
      return PAYMENT_EVENTS.includes(e.event.kind) ? 'payments' : 'guests'
    case 'email_refused':
      return 'guests'
    case 'people':
      return 'changes'
    case 'question':
      return 'comms'
    case 'change':
      switch (e.change.what) {
        case 'expense':
          return 'payments'
        case 'interest_removed':
          return 'guests'
        case 'announcement':
        case 'question':
        case 'signups_opened':
          return 'comms'
        default:
          return 'changes'
      }
  }
}
