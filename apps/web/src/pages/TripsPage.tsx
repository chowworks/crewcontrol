import type { TripSummary } from '@cc/types'
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { SampleTripBadge } from '@/components/SampleTripBadge'
import { api } from '@/lib/api'
import { dateRange } from '@/lib/format'

export function TripsPage() {
  const [trips, setTrips] = useState<TripSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .listTrips()
      .then(setTrips)
      .catch(() => setError('Trips could not be loaded. Is the API running?'))
  }, [])

  return (
    <div className="min-h-screen">
      <main className="mx-auto flex max-w-[960px] flex-col gap-6 px-5 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Logo className="mb-1" />
            <h1 className="text-3xl font-extrabold">Your trips</h1>
          </div>
          <Link
            to="/organize/new"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-royal px-4 font-semibold text-white hover:bg-royal-dark"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            New trip
          </Link>
        </div>
        {error && <p className="rounded-xl bg-white p-4 text-body">{error}</p>}
        {trips && trips.length === 0 && (
          <p className="rounded-xl bg-white p-6 text-body">
            No trips yet. Start one with New trip.
          </p>
        )}
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {trips?.map((t) => (
            <li key={t.id} className="overflow-hidden rounded-2xl bg-white shadow-card">
              <div className="relative h-36 bg-placeholder">
                {t.isSample && <SampleTripBadge className="absolute left-3 top-3 z-10" />}
                {t.coverUrl && (
                  <img src={t.coverUrl} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="flex flex-col gap-1 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-extrabold leading-tight">{t.name}</h2>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      t.published ? 'bg-royal-pale text-royal' : 'bg-ground text-muted'
                    }`}
                  >
                    {t.published ? 'Published' : 'Draft'}
                  </span>
                </div>
                <p className="text-sm text-muted">
                  {t.destination} · {dateRange(t.startDate, t.endDate)}
                </p>
                <div className="mt-2 flex gap-4 text-sm font-semibold">
                  <Link to={`/organize/${t.id}`} className="py-2 text-royal hover:text-royal-dark">
                    Edit
                  </Link>
                  {t.published && (
                    <Link to={`/t/${t.slug}`} className="py-2 text-royal hover:text-royal-dark">
                      Guest page
                    </Link>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
