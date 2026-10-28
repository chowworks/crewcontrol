import { createContext, useContext } from 'react'
import { Link } from 'react-router-dom'

/**
 * The Admin toolbox looking at a trip it doesn't sit on (owner's decision, 2026-10-28): Edit and Control panel open
 * read-only, through the admin's routes, with no seat and no log line for a plain look.
 */
export const AdminView = createContext(false)
export const useAdminView = () => useContext(AdminView)

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
