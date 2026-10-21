import { Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SampleTripBadge } from '@/components/SampleTripBadge'
import { api, type AdminTrip } from '@/lib/api'
import { dateRange } from '@/lib/format'
import { AdminHow, AdminShell, AdminToolHead } from './AdminPage'

interface RowsProps {
  trips: AdminTrip[]
  /** Seats the admin on the trip (logged), then opens `path`; `asOwner` for a trip with no owner. */
  onOpen: (trip: AdminTrip, path: string, asOwner?: boolean) => void
}

const owner = (t: AdminTrip) => (t.isSample ? 'Sample trip' : (t.ownerName ?? 'No owner yet'))

function Status({ t }: { t: AdminTrip }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        t.published ? 'bg-royal-pale text-royal' : 'bg-ground text-muted'
      }`}
    >
      {t.published ? 'Published' : 'Draft'}
    </span>
  )
}

function Cover({ t, className }: { t: AdminTrip; className: string }) {
  return (
    <div className={`relative overflow-hidden bg-placeholder ${className}`}>
      {t.coverUrl && <img src={t.coverUrl} alt="" className="h-full w-full object-cover" />}
    </div>
  )
}

/** Going against the limit as a bar, or plain counts when there's no limit. */
function SignupMeter({ t }: { t: AdminTrip }) {
  const pct = t.maxGuests ? Math.min(100, Math.round((t.goingCount / t.maxGuests) * 100)) : null
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm text-body">
        <strong className="text-ink">{t.goingCount} going</strong>
        {t.maxGuests ? ` of ${t.maxGuests}` : ''} · {t.interestedCount} interested
      </span>
      {pct !== null && (
        <span className="h-2 overflow-hidden rounded-full bg-ground">
          <span className="block h-full rounded-full bg-marigold" style={{ width: `${pct}%` }} />
        </span>
      )}
    </div>
  )
}

function Actions({ t, onOpen }: { t: AdminTrip; onOpen: RowsProps['onOpen'] }) {
  const outline = 'border-royal text-royal hover:bg-royal-pale'
  const button = 'inline-flex min-h-[44px] items-center rounded-xl px-4 text-sm font-semibold'
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onOpen(t, `/organize/${t.id}/control`)}
        className={`${button} bg-royal text-white hover:bg-royal-dark`}
      >
        Control panel
      </button>
      <button
        type="button"
        onClick={() => onOpen(t, `/organize/${t.id}`)}
        className={`${button} border ${outline}`}
      >
        Edit
      </button>
      {t.published && (
        <Link to={`/t/${t.slug}`} className={`${button} border ${outline}`}>
          Guest page
        </Link>
      )}
      {!t.isSample && !t.ownerName && (
        <button
          type="button"
          onClick={() => onOpen(t, `/organize/${t.id}/control`, true)}
          className={`${button} border ${outline}`}
        >
          Make me the owner
        </button>
      )}
    </div>
  )
}

/** One row per trip: a photo thumbnail, details in the middle and actions at the right. */
function TripRows({ trips, onOpen }: RowsProps) {
  return (
    <ul className="flex flex-col divide-y divide-rule overflow-hidden rounded-2xl bg-white shadow-card">
      {trips.map((t) => (
        <li key={t.id} className="flex flex-wrap items-center gap-4 p-4">
          <Cover t={t} className="h-24 w-36 shrink-0 rounded-xl" />
          <div className="flex min-w-[220px] flex-1 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-extrabold">{t.name}</span>
              <Status t={t} />
              {t.isSample && <SampleTripBadge />}
            </span>
            <span className="text-sm text-muted">
              {t.destination} · {dateRange(t.startDate, t.endDate)} · Run by {owner(t)}
            </span>
            <div className="mt-1 max-w-[320px]">
              <SignupMeter t={t} />
            </div>
          </div>
          <Actions t={t} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  )
}

const SORTS = {
  soonest: {
    label: 'Trip date, soonest first',
    by: (a: AdminTrip, b: AdminTrip) => a.startDate.localeCompare(b.startDate),
  },
  latest: {
    label: 'Trip date, latest first',
    by: (a: AdminTrip, b: AdminTrip) => b.startDate.localeCompare(a.startDate),
  },
  name: { label: 'Name, A to Z', by: (a: AdminTrip, b: AdminTrip) => a.name.localeCompare(b.name) },
  going: { label: 'Most going', by: (a: AdminTrip, b: AdminTrip) => b.goingCount - a.goingCount },
  interested: {
    label: 'Most interested',
    by: (a: AdminTrip, b: AdminTrip) => b.interestedCount - a.interestedCount,
  },
}
type SortKey = keyof typeof SORTS

/** What the search box matches: the trip's name, place, link and who runs it. */
const haystack = (t: AdminTrip) => [t.name, t.destination, t.slug, owner(t)].join(' ').toLowerCase()

/** Trip admin: every trip on CrewControl, for admins, with a search and a sort. */
export function AdminTripsPage() {
  const [trips, setTrips] = useState<AdminTrip[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('soonest')
  const navigate = useNavigate()

  const load = useCallback(() => {
    api
      .adminTrips()
      .then(setTrips)
      .catch((err) => setError(err instanceof Error ? err.message : 'Trips could not be loaded.'))
  }, [])
  useEffect(load, [load])

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return (trips ?? [])
      .filter((t) => words.every((w) => haystack(t).includes(w)))
      .sort(SORTS[sort].by)
  }, [trips, query, sort])

  // Opening a trip seats the admin on it as an organizer (or its owner, when it has none), so it works on the trip
  // as a member. The database logs every seat in the trip's access log.
  async function open(t: AdminTrip, path: string, asOwner = false) {
    setError(null)
    try {
      await api.seatOnTrip(t.id, asOwner)
      navigate(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.')
    }
  }

  const field =
    'min-h-[48px] rounded-xl border border-rule bg-white px-4 text-[16px] text-ink focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/30'
  return (
    <AdminShell>
      <AdminToolHead to="/admin/trips" />
      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-royal-pale px-4 py-3 text-ink">
          {error}
        </p>
      )}
      {trips && (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <label className="relative min-w-[240px] flex-1">
              <span className="sr-only">Search trips</span>
              <Search
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by trip, place, link or who runs it"
                className={`${field} w-full pl-11`}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-muted">
              Sort by
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className={field}
              >
                {Object.entries(SORTS).map(([key, s]) => (
                  <option key={key} value={key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mb-2 text-sm text-muted" aria-live="polite">
            {shown.length === trips.length
              ? `${trips.length} trips`
              : `${shown.length} of ${trips.length} trips`}
          </p>
          {shown.length > 0 ? (
            <TripRows trips={shown} onOpen={open} />
          ) : (
            <p className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
              No trip matches “{query}”.
            </p>
          )}
        </>
      )}
      <AdminHow to="/admin/trips" />
    </AdminShell>
  )
}
