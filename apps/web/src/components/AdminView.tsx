import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '@/lib/api'
import { useIsAdmin } from '@/lib/auth'

/**
 * The Admin toolbox looking at a trip it doesn't sit on (owner's decision, 2026-10-28): Edit and Control panel open
 * read-only, through the admin's routes, with no seat and no log line for a plain look.
 */
export const AdminView = createContext(false)
export const useAdminView = () => useContext(AdminView)

/**
 * An admin's Control panel or Edit for a trip. An admin who is on the trip (one of Your trips) opens it as its
 * organizer instead, so the same person never gets two views of one trip; anyone else gets the read-only view.
 */
export function AdminTripView({
  page,
  children,
}: {
  page: 'control' | 'edit'
  children: ReactNode
}) {
  const { id = '' } = useParams()
  const [member, setMember] = useState<boolean | null>(null)
  useEffect(() => {
    setMember(null)
    api
      .listTrips()
      .then((trips) => setMember(trips.some((t) => t.id === id && !t.eraseOn)))
      .catch(() => setMember(false))
  }, [id])
  if (member === null) return null
  if (member)
    return <Navigate to={page === 'edit' ? `/organize/${id}` : `/organize/${id}/control`} replace />
  return <AdminView.Provider value>{children}</AdminView.Provider>
}

/**
 * The other way round: an admin who opens a trip's organizer page without being on the trip (the server says it isn't
 * there for them) goes to the admin's read-only view of it. Returns true when it sent them there.
 */
export function useAdminFallback(id: string, page: 'control' | 'edit') {
  const isAdmin = useIsAdmin()
  const adminView = useAdminView()
  const navigate = useNavigate()
  return (err: unknown) => {
    if (!isAdmin || adminView || !(err instanceof ApiError) || err.status !== 404) return false
    navigate(`/admin/trips/${id}/${page}`, { replace: true })
    return true
  }
}

/** Says the page is read-only, and where an admin goes to change the trip. */
export function AdminViewNote({ tripId }: { tripId: string }) {
  return (
    <p className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
      You’re looking as an admin, so nothing here can be changed. To change the trip, add yourself
      on its{' '}
      <Link
        to={`/admin/trips/${tripId}/people`}
        className="font-semibold text-royal underline underline-offset-2"
      >
        People screen
      </Link>
      .
    </p>
  )
}
