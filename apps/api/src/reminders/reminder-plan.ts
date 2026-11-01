import { canPay } from '../join/guest-pay'
import { totalDueCents, type Guest, type OrganizerTrip } from '../trips/trip-types'

/**
 * Which reminders a trip sends, when, and to whom (issue #12). Two kinds: a payment reminder before each installment's
 * due date, to the guests who still owe something by then, from the plan each guest signed; and a key date reminder,
 * to every accepted guest. Each goes out once to each guest, in the morning of its day; one missed (the API was down)
 * still goes later, until its date has passed. Pure, so its spec can pin it down.
 */

export interface PlannedReminder {
  /** What the sent log records it by: a guest gets each key once. */
  key: string
  kind: 'payment' | 'date'
  /** The date it's about, and the day it goes out ('YYYY-MM-DD'). */
  date: string
  sendOn: string
  /** "Payment 2 of 3", or the key date's words. */
  label: string
}

/** A reminder and who it's for, whether or not it's time yet. */
export interface ReminderFor {
  reminder: PlannedReminder
  guest: Guest
  /** For a payment reminder: what the guest owes by its date, after what they paid or reported. */
  owedCents: number
}

/** The hour (UTC) a reminder goes out on its day: 14:00 UTC is the morning across the US. */
export const SEND_HOUR_UTC = 14

export const isoDay = (d: Date) => d.toISOString().slice(0, 10)

export function minusDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return isoDay(d)
}

/** Whether a reminder goes out at `now`: its morning has come, and its date hasn't passed. */
export function isDue(r: PlannedReminder, now: Date): boolean {
  const today = isoDay(now)
  const started = today > r.sendOn || (today === r.sendOn && now.getUTCHours() >= SEND_HOUR_UTC)
  return started && today <= r.date
}

/**
 * What a guest owes by installment `k` (from 1) of their plan: its first k amounts, less what they paid or reported.
 * The last installment asks for everything left, credits and charges included.
 */
export function owedBy(terms: NonNullable<Guest['terms']>, k: number): number {
  const total = totalDueCents(terms)
  const byThen =
    k >= terms.schedule.length
      ? total
      : Math.min(
          total,
          terms.schedule.slice(0, k).reduce((n, p) => n + p.amountCents, 0)
        )
  return Math.max(0, byThen - terms.paidCents - terms.pendingCents)
}

/**
 * A guest's due dates: the ones their agreement quoted, or the trip's current ones when they signed before plans had
 * dates (or their plan had none).
 */
function dueDatesOf(g: Guest, trip: Pick<OrganizerTrip, 'paymentDueDates'>): string[] {
  const signed = g.terms?.schedule.map((p) => p.dueOn) ?? []
  return signed.length > 0 && signed.every((d): d is string => d !== null)
    ? signed
    : trip.paymentDueDates
}

/**
 * Every reminder the trip's settings ask for, for each guest it's for, past or not, in the order they go out. Guests
 * who stopped updates for this trip, and anyone turned down, get none.
 */
export function remindersFor(
  trip: Pick<OrganizerTrip, 'keyDates' | 'paymentDueDates' | 'paymentReminderDays' | 'joinMode'>,
  guests: Guest[],
  stopped: (g: Guest) => boolean
): ReminderFor[] {
  const out: ReminderFor[] = []
  for (const guest of guests) {
    if (stopped(guest) || guest.status === 'declined') continue
    // An organizer going on their own trip gets no payment reminders: the money is theirs to track (issue #53).
    if (
      trip.paymentReminderDays !== null &&
      guest.terms &&
      !guest.organizer &&
      canPay(trip.joinMode, guest)
    ) {
      const dates = dueDatesOf(guest, trip)
      dates.forEach((date, i) => {
        const owedCents = owedBy(guest.terms!, i + 1)
        if (owedCents > 0)
          out.push({
            reminder: {
              key: `payment:${i + 1}:${date}`,
              kind: 'payment',
              date,
              sendOn: minusDays(date, trip.paymentReminderDays as number),
              label: `Payment ${i + 1} of ${dates.length}`,
            },
            guest,
            owedCents,
          })
      })
    }
    if (guest.status === 'approved')
      for (const k of trip.keyDates)
        if (k.remindDaysBefore !== undefined && k.remindDaysBefore !== null)
          out.push({
            reminder: {
              key: `date:${k.date}:${k.label}`,
              kind: 'date',
              date: k.date,
              sendOn: minusDays(k.date, k.remindDaysBefore),
              label: k.label,
            },
            guest,
            owedCents: 0,
          })
  }
  return out.sort(
    (a, b) =>
      a.reminder.sendOn.localeCompare(b.reminder.sendOn) ||
      a.reminder.date.localeCompare(b.reminder.date)
  )
}

/** "today", "tomorrow", "in 3 days", "in 1 week", "in 2 weeks", "in 30 days": how soon, from `today`. */
export function howSoon(date: string, today: string): string {
  const days = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000
  )
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === 7) return 'in 1 week'
  if (days === 14) return 'in 2 weeks'
  return `in ${days} days`
}
