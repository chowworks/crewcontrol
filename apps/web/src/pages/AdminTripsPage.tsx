import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { rowButton, TripList } from '@/components/TripList'
import { api, type ListedTrip } from '@/lib/api'
import { AdminHow, AdminShell, AdminToolHead } from './AdminPage'

/** Trip admin: every trip on Travel HQ, for admins, in the same list as Your trips. */
export function AdminTripsPage() {
  const [trips, setTrips] = useState<ListedTrip[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const load = useCallback(() => {
    api
      .adminTrips()
      .then(setTrips)
      .catch((err) => setError(err instanceof Error ? err.message : 'Trips could not be loaded.'))
  }, [])
  useEffect(load, [load])

  // Opening a trip seats the admin on it as an organizer (or its owner, when it has none), so it works on the trip
  // as a member. The database logs every seat in the trip's access log.
  async function open(t: ListedTrip, path: string, asOwner = false) {
    setError(null)
    try {
      await api.seatOnTrip(t.id, asOwner)
      navigate(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.')
    }
  }

  return (
    <AdminShell>
      <AdminToolHead to="/admin/trips" />
      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-royal-pale px-4 py-3 text-ink">
          {error}
        </p>
      )}
      {trips && (
        <TripList
          trips={trips}
          actions={(t) => (
            <>
              <button
                type="button"
                onClick={() => open(t, `/organize/${t.id}/control`)}
                className={rowButton(true)}
              >
                Control panel
              </button>
              <button
                type="button"
                onClick={() => open(t, `/organize/${t.id}`)}
                className={rowButton()}
              >
                Edit
              </button>
              {t.published && (
                <Link to={`/t/${t.slug}`} className={rowButton()}>
                  Guest page
                </Link>
              )}
              {!t.isSample && !t.ownerName && (
                <button
                  type="button"
                  onClick={() => open(t, `/organize/${t.id}/control`, true)}
                  className={rowButton()}
                >
                  Make me the owner
                </button>
              )}
            </>
          )}
        />
      )}
      <AdminHow to="/admin/trips" />
    </AdminShell>
  )
}
