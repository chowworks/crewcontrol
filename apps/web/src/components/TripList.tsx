import { Search } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { SampleTripBadge } from '@/components/SampleTripBadge'
import type { ListedTrip } from '@/lib/api'
import { dateRange } from '@/lib/format'

const owner = (t: ListedTrip) => (t.isSample ? 'Sample trip' : (t.ownerName ?? 'No owner yet'))

function Status({ t }: { t: ListedTrip }) {
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

function Cover({ t, className }: { t: ListedTrip; className: string }) {
  return (
    <div className={`relative overflow-hidden bg-placeholder ${className}`}>
      {t.coverUrl && <img src={t.coverUrl} alt="" className="h-full w-full object-cover" />}
    </div>
  )
}

/** Going against the limit as a bar, or plain counts when there's no limit. */
function SignupMeter({ t }: { t: ListedTrip }) {
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

const SORTS = {
  soonest: {
    label: 'Trip date, soonest first',
    by: (a: ListedTrip, b: ListedTrip) => a.startDate.localeCompare(b.startDate),
  },
  latest: {
    label: 'Trip date, latest first',
    by: (a: ListedTrip, b: ListedTrip) => b.startDate.localeCompare(a.startDate),
  },
  name: {
    label: 'Name, A to Z',
    by: (a: ListedTrip, b: ListedTrip) => a.name.localeCompare(b.name),
  },
  going: { label: 'Most going', by: (a: ListedTrip, b: ListedTrip) => b.goingCount - a.goingCount },
  interested: {
    label: 'Most interested',
    by: (a: ListedTrip, b: ListedTrip) => b.interestedCount - a.interestedCount,
  },
}
type SortKey = keyof typeof SORTS

/** What the search box matches: the trip's name, place, link and who runs it. */
const haystack = (t: ListedTrip) =>
  [t.name, t.destination, t.slug, owner(t)].join(' ').toLowerCase()

/**
 * The trip list Your trips and Trip admin share: a search, a sort, then one row per trip with a photo thumbnail,
 * details in the middle and the page's own buttons for that trip (`actions`) at the right.
 */
export function TripList({
  trips,
  actions,
}: {
  trips: ListedTrip[]
  actions: (trip: ListedTrip) => ReactNode
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('soonest')
  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return trips.filter((t) => words.every((w) => haystack(t).includes(w))).sort(SORTS[sort].by)
  }, [trips, query, sort])

  const field =
    'min-h-[48px] rounded-xl border border-rule bg-white px-4 text-[16px] text-ink focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/30'
  return (
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
        <ul className="flex flex-col divide-y divide-rule overflow-hidden rounded-2xl bg-white shadow-card">
          {shown.map((t) => (
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
              <div className="flex flex-wrap gap-2">{actions(t)}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-royal-pale px-4 py-3 text-ink">No trip matches “{query}”.</p>
      )}
    </>
  )
}

/** A trip row's buttons: `main` is the filled one. */
export const rowButton = (main = false) =>
  `inline-flex min-h-[44px] items-center rounded-xl px-4 text-sm font-semibold ${
    main
      ? 'bg-royal text-white hover:bg-royal-dark'
      : 'border border-royal text-royal hover:bg-royal-pale'
  }`
