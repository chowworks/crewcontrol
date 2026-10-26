import type { OrganizerRequest } from '@cc/types'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { AdminHow, AdminShell, AdminToolHead } from './AdminPage'

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/** Organizer requests: what organizers asked for that CrewControl doesn't do yet (for now, other refund terms). */
export function AdminRequestsPage() {
  const [requests, setRequests] = useState<OrganizerRequest[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .adminRequests()
      .then(setRequests)
      .catch(() => setError('The requests could not be loaded.'))
  }, [])

  return (
    <AdminShell>
      <AdminToolHead to="/admin/requests" />
      {error && (
        <p role="alert" className="mb-4 font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      {requests && requests.length === 0 && (
        <p className="rounded-2xl bg-white p-6 text-body shadow-card">No requests yet.</p>
      )}
      {requests && requests.length > 0 && (
        <ul className="flex flex-col gap-3">
          {requests.map((r) => (
            <li key={r.id} className="rounded-2xl bg-white p-5 shadow-card">
              <div className="text-sm text-muted">
                {when(r.createdAt)} · Refund terms · {r.userName}
                {r.tripName ? ` · ${r.tripName}` : ''}
              </div>
              <p className="mt-1.5 whitespace-pre-line text-ink">{r.text}</p>
            </li>
          ))}
        </ul>
      )}
      <AdminHow to="/admin/requests" />
    </AdminShell>
  )
}
