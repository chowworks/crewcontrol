import type { OrganizerTrip, TripLogEntry } from '@cc/types'
import { Download, ScrollText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAdminView } from '@/components/AdminView'
import { api } from '@/lib/api'
import { type Cell, downloadCsv, fileSlug, stamp } from '@/lib/csv'
import { eventText, IconCircle } from './TripGuests'
import { type ChangeGroup, changeSentence, groupText, mergeEdits } from './tripChanges'

// The trip log at the bottom of Trip Control (owner's decision, 2026-10-24): joins refused because the email is
// already on the trip, what organizers changed (2026-11-01), changes to who runs it (and the admin's visits), and, with
// the box ticked, every guest's history, newest first.

const at = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

type PeopleEntry = Extract<TripLogEntry, { kind: 'people' }>
const roleWord = (r: PeopleEntry['role']) => (r === 'owner' ? 'an owner' : 'an organizer')
/** Who did it: the owner by name, the admin as "An admin". */
const actor = (e: PeopleEntry) => (e.byAdmin ? 'An admin' : e.actorName)

/** A change to who runs the trip, in plain words. */
function peopleText(e: PeopleEntry): string {
  if (e.action === 'open') return 'An admin opened the trip'
  if (e.action === 'insert')
    return e.self
      ? `${actor(e)} joined as ${roleWord(e.role)}`
      : `${actor(e)} added ${e.subjectName} as ${roleWord(e.role)}`
  if (e.action === 'update')
    return e.self
      ? `${actor(e)} became ${roleWord(e.role)}`
      : `${actor(e)} made ${e.subjectName} ${roleWord(e.role)}`
  return e.self ? `${actor(e)} stepped down` : `${actor(e)} removed ${e.subjectName}`
}

type QuestionEntry = Extract<TripLogEntry, { kind: 'question' }>
/** A question asked, answered or added, in plain words (issue #13). */
function questionText(e: QuestionEntry): string {
  if (e.action === 'asked') return `${e.name} asked: “${e.question}”`
  if (e.action === 'added') return `${e.name} added a question to the trip page: “${e.question}”`
  return e.status === 'private'
    ? `${e.name} answered ${e.askerName}’s question just for them: “${e.question}”`
    : `${e.name} answered ${e.askerName}’s question for everyone: “${e.question}”`
}

/** "Nov 1, 9:02 AM – 9:14 AM" for saves on one day, both in full otherwise. */
function span(first: string, last: string): string {
  if (at(first) === at(last)) return at(last)
  const sameDay = new Date(first).toDateString() === new Date(last).toDateString()
  const end = sameDay
    ? new Date(last).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })
    : at(last)
  return `${at(first)} – ${end}`
}

function Line({ e }: { e: TripLogEntry | ChangeGroup }) {
  if (e.kind === 'changes')
    return (
      <>
        <div className="font-semibold [overflow-wrap:anywhere]">{groupText(e)}</div>
        <div className="text-sm text-muted">{span(e.first, e.at)}</div>
      </>
    )
  if (e.kind === 'change')
    return (
      <>
        <div className="font-semibold [overflow-wrap:anywhere]">{changeSentence(e)}</div>
        <div className="text-sm text-muted">{at(e.at)}</div>
      </>
    )
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
  if (e.kind === 'people')
    return (
      <>
        <div className="font-semibold">{peopleText(e)}</div>
        <div className="text-sm text-muted">{at(e.at)}</div>
      </>
    )
  if (e.kind === 'question')
    return (
      <>
        <div className="font-semibold [overflow-wrap:anywhere]">{questionText(e)}</div>
        <div className="text-sm text-muted">{at(e.at)}</div>
      </>
    )
  const who =
    e.event.actor === 'guest'
      ? e.guestName
      : e.event.actor === 'organizer'
        ? (e.event.byName ?? 'An organizer')
        : 'Travel HQ'
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
  if (e.kind === 'people') return [stamp(e.at), peopleText(e), null, actor(e), null, null, null]
  if (e.kind === 'question') return [stamp(e.at), questionText(e), null, e.name, null, null, null]
  if (e.kind === 'change')
    return [
      stamp(e.at),
      changeSentence(e),
      null,
      e.byAdmin ? 'An admin' : e.actorName,
      null,
      null,
      null,
    ]
  const who =
    e.event.actor === 'guest'
      ? e.guestName
      : e.event.actor === 'organizer'
        ? (e.event.byName ?? 'An organizer')
        : 'Travel HQ'
  return [stamp(e.at), eventText(e.event), e.guestName, who, null, null, null]
}

/** The whole trip log as spreadsheet rows: the log's Export, and part of Download everything. */
export function tripLogRows(entries: TripLogEntry[]): Cell[][] {
  return [
    ['When', 'What happened', 'Guest', 'Who', 'Typed', 'From', 'Browser'],
    ...entries.map(row),
  ]
}

/** The trip log, reloaded whenever the trip changes so a change just made shows up. */
export function TripLogCard({ trip }: { trip: OrganizerTrip }) {
  const [entries, setEntries] = useState<TripLogEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guests, setGuests] = useState(true)
  const [all, setAll] = useState(false)
  const admin = useAdminView()
  useEffect(() => {
    const load = () =>
      api
        .getTripLog(trip.id, admin)
        .then(setEntries)
        .catch(() => setError('The trip log could not be loaded.'))
    load()
    // A question answered or added doesn't change the trip, but Trip Control says so (cc:actions-changed).
    window.addEventListener('cc:actions-changed', load)
    return () => window.removeEventListener('cc:actions-changed', load)
  }, [trip, admin])
  // One person's editor saves close together read as one line; the Export keeps each save.
  const shown = mergeEdits((entries ?? []).filter((e) => guests || e.kind !== 'guest'))
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
            onClick={() => downloadCsv(`${fileSlug(trip.name)}-trip-log`, tripLogRows(entries))}
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
