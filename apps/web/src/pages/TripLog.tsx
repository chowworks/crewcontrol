import type { OrganizerTrip, TripLogEntry } from '@cc/types'
import { Download, ScrollText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { downloadCsv, fileSlug, stamp } from '@/lib/csv'
import { eventText, IconCircle } from './TripGuests'

// The trip log at the bottom of Trip Control (owner's decision, 2026-10-24): joins refused because the email is
// already on the trip, the admin's visits, and, with the box ticked, every guest's history, newest first.

const at = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

const ADMIN: Record<Extract<TripLogEntry, { kind: 'admin' }>['action'], string> = {
  insert: 'An admin joined the trip’s organizers',
  update: 'An admin changed an organizer’s role',
  delete: 'An organizer was removed by an admin',
  open: 'An admin opened the trip',
}

function Line({ e }: { e: TripLogEntry }) {
  if (e.kind === 'email_refused')
    return (
      <>
        <div className="font-semibold">
          Someone tried an email that can’t be used{e.blocked ? ' (blocked for 10 minutes)' : ''}
        </div>
        <div className="break-all text-sm text-body">
          Typed {[e.name, e.email, e.phone].filter(Boolean).join(' · ')}
        </div>
        <div className="break-all text-sm text-muted">
          {at(e.at)} · from {e.ipAddress || 'an unknown address'} ·{' '}
          {e.userAgent || 'unknown browser'}
        </div>
      </>
    )
  if (e.kind === 'admin')
    return (
      <>
        <div className="font-semibold">{ADMIN[e.action]}</div>
        <div className="text-sm text-muted">{at(e.at)}</div>
      </>
    )
  const who =
    e.event.actor === 'guest'
      ? e.guestName
      : e.event.actor === 'organizer'
        ? 'An organizer'
        : 'CrewControl'
  return (
    <>
      <div className="font-semibold">
        {e.guestName}: {eventText(e.event)}
      </div>
      <div className="text-sm text-muted">
        {at(e.at)} · {who}
      </div>
    </>
  )
}

/** One log line for the spreadsheet: when, what happened, the guest, who did it, and for a refused join its details. */
function row(e: TripLogEntry): (string | null)[] {
  if (e.kind === 'email_refused')
    return [
      stamp(e.at),
      `Someone tried an email that can’t be used${e.blocked ? ' (blocked for 10 minutes)' : ''}`,
      null,
      'Someone joining',
      [e.name, e.email, e.phone].filter(Boolean).join(' · '),
      e.ipAddress || null,
      e.userAgent || null,
    ]
  if (e.kind === 'admin') return [stamp(e.at), ADMIN[e.action], null, 'An admin', null, null, null]
  const who =
    e.event.actor === 'guest'
      ? e.guestName
      : e.event.actor === 'organizer'
        ? 'An organizer'
        : 'CrewControl'
  return [stamp(e.at), eventText(e.event), e.guestName, who, null, null, null]
}

/** The trip log, reloaded whenever the trip changes so a change just made shows up. */
export function TripLogCard({ trip }: { trip: OrganizerTrip }) {
  const [entries, setEntries] = useState<TripLogEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guests, setGuests] = useState(true)
  const [all, setAll] = useState(false)
  useEffect(() => {
    api
      .getTripLog(trip.id)
      .then(setEntries)
      .catch(() => setError('The trip log could not be loaded.'))
  }, [trip])
  const shown = (entries ?? []).filter((e) => guests || e.kind !== 'guest')
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-xl font-extrabold">
          <IconCircle icon={ScrollText} />
          Trip log
        </h2>
        {/* Every line, guest activity included, whatever the box below shows (owner's decision, 2026-10-26). */}
        {entries && entries.length > 0 && (
          <button
            type="button"
            onClick={() =>
              downloadCsv(`${fileSlug(trip.name)}-trip-log`, [
                ['When', 'What happened', 'Guest', 'Who', 'Typed', 'From', 'Browser'],
                ...entries.map(row),
              ])
            }
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export
          </button>
        )}
      </div>
      <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={guests}
          onChange={(e) => setGuests(e.target.checked)}
          className="h-5 w-5 accent-royal"
        />
        Show guest activity
      </label>
      {error && (
        <p role="alert" className="font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      {entries && shown.length === 0 && <p className="text-body">Nothing logged yet.</p>}
      {shown.length > 0 && (
        <ol className="flex flex-col">
          {(all ? shown : shown.slice(0, 30)).map((e, i) => (
            <li key={i} className="border-t border-rule py-2.5 first:border-t-0">
              <Line e={e} />
            </li>
          ))}
        </ol>
      )}
      {!all && shown.length > 30 && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="inline-flex min-h-[44px] items-center self-start rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale"
        >
          Show all {shown.length}
        </button>
      )}
    </section>
  )
}
