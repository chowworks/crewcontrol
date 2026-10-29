import type { OrganizerTrip, TripReminders } from '@cc/types'
import { BellRing } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { shortDate } from '@/lib/format'
import { IconCircle } from './TripGuests'

// Trip Control's Reminders section (issue #12): what goes out when and to whom, what already went, and who stopped
// them. The settings live in the trip editor; this only shows what they do.

const day = (date: string) => `${shortDate(date)}, ${date.slice(0, 4)}`

/** "Ana Reyes, Ben Kim and 5 more". */
function names(list: string[]): string {
  if (list.length <= 3) return list.join(', ')
  return `${list.slice(0, 2).join(', ')} and ${list.length - 2} more`
}

/** Reloaded whenever the trip changes, so a payment just confirmed drops that guest from what's still to go. */
export function RemindersCard({ trip }: { trip: OrganizerTrip }) {
  const [data, setData] = useState<TripReminders | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api
      .getReminders(trip.id)
      .then(setData)
      .catch(() => setError('Reminders could not be loaded.'))
  }, [trip])
  const empty = data && data.upcoming.length === 0 && data.sent.length === 0
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-xl font-extrabold">
          <IconCircle icon={BellRing} />
          Reminders
        </h2>
        <Link
          to={`/organize/${trip.id}?step=4`}
          className="inline-flex min-h-[44px] items-center rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale"
        >
          Change reminders
        </Link>
      </div>
      {error && (
        <p role="alert" className="font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      {empty && (
        <p className="text-body">
          No reminders set. Payment reminders are on the editor’s Price and payments step; a key
          date gets one on Trip basics.
        </p>
      )}
      {data && data.upcoming.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-muted">Still to go out</h3>
          <ol className="flex flex-col">
            {data.upcoming.map((r, i) => (
              <li key={i} className="border-t border-rule py-2.5 first:border-t-0">
                <div className="font-semibold">
                  {r.paymentDue ? `${r.label}, due ${day(r.date)}` : `${r.label}, ${day(r.date)}`}
                </div>
                <div className="text-sm text-body">
                  Goes out {day(r.sendOn)} to {names(r.to)}
                  {r.paymentDue ? ', if they still owe' : ''}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      {data && data.sent.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-muted">Sent</h3>
          <ol className="flex flex-col">
            {data.sent.map((r, i) => (
              <li key={i} className="border-t border-rule py-2.5 first:border-t-0">
                <div className="font-semibold">
                  {r.paymentDue ? `${r.label}, due ${day(r.date)}` : `${r.label}, ${day(r.date)}`}
                </div>
                <div className="text-sm text-body">
                  Sent {day(r.sentAt.slice(0, 10))} to {names(r.to)}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      {data && data.stopped.length > 0 && (
        <p className="rounded-xl bg-royal-pale px-4 py-3 text-sm text-ink">
          {names(data.stopped)} turned reminders off for this trip. Other trip emails, like being
          accepted, still reach them.
        </p>
      )}
    </section>
  )
}
