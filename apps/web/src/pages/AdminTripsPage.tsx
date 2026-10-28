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

  // Control panel and Edit only look, read-only and without a seat (owner's decision, 2026-10-28). Taking an ownerless
  // trip seats the admin as its owner, which the database logs in the trip's access log.
  async function takeOwnership(t: ListedTrip) {
    setError(null)
    try {
      await api.seatOnTrip(t.id, true)
      navigate(`/organize/${t.id}/control`)
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
              <Link to={`/admin/trips/${t.id}/control`} className={rowButton(true)}>
                Control panel
              </Link>
              <Link to={`/admin/trips/${t.id}/edit`} className={rowButton()}>
                Edit
              </Link>
              <Link to={`/admin/trips/${t.id}/people`} className={rowButton()}>
                People
              </Link>
              {t.published && (
                <Link to={`/t/${t.slug}`} className={rowButton()}>
                  Guest page
                </Link>
              )}
              {!t.isSample && !t.ownerName && (
                <button type="button" onClick={() => takeOwnership(t)} className={rowButton()}>
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
