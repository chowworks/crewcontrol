import type { TripSummary } from '@cc/types'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SampleTripBadge } from '@/components/SampleTripBadge'
import { api } from '@/lib/api'
import { dateRange } from '@/lib/format'

/** The sample trips as cards that open each trip page, for the home page and the limited preview page. */
export function SampleTripCards({ children }: { children: React.ReactNode }) {
  const [trips, setTrips] = useState<TripSummary[]>([])

  useEffect(() => {
    api
      .listSampleTrips()
      .then(setTrips)
      .catch(() => setTrips([]))
  }, [])

  if (trips.length === 0) return null
  return (
    <section className="mx-auto max-w-[1120px] px-5 pt-16">
      {children}
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {trips.map((t) => (
          <li key={t.id}>
            <Link
              to={`/t/${t.slug}`}
              className="group block overflow-hidden rounded-2xl bg-white shadow-card focus:outline-none focus-visible:ring-4 focus-visible:ring-royal"
            >
              <div className="relative h-44 overflow-hidden bg-placeholder">
                <SampleTripBadge className="absolute left-3 top-3 z-10" />
                {t.coverUrl && (
                  <img
                    src={t.coverUrl}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                )}
              </div>
              <div className="flex flex-col gap-1 p-4">
                <h3 className="text-lg font-extrabold leading-tight">{t.name}</h3>
                <p className="text-sm text-muted">
                  {t.destination} · {dateRange(t.startDate, t.endDate)}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
