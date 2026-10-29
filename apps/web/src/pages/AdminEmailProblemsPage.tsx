import type { EmailProblemNotice } from '@cc/types'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { AdminHow, AdminShell, AdminToolHead } from './AdminPage'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

const KIND: Record<EmailProblemNotice['kind'], string> = {
  bounced: 'Bounced',
  blocked: 'Blocked: bounced before',
  complained: 'Marked as spam',
}

/** Email problems: every bounce, blocked send and spam complaint Resend reported, on every trip, newest first. */
export function AdminEmailProblemsPage() {
  const [problems, setProblems] = useState<EmailProblemNotice[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .adminEmailProblems()
      .then(setProblems)
      .catch(() => setError('The email problems could not be loaded.'))
  }, [])

  return (
    <AdminShell>
      <AdminToolHead to="/admin/email-problems" />
      {error && (
        <p role="alert" className="mb-4 font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      {problems && problems.length === 0 && (
        <p className="rounded-2xl bg-white p-6 text-body shadow-card">
          No bounces or spam complaints.
        </p>
      )}
      {problems && problems.length > 0 && (
        <ul className="flex flex-col gap-3">
          {problems.map((p) => (
            <li key={p.id} className="rounded-2xl bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-semibold text-[#B42318]">{KIND[p.kind]}</span>
                <span className="break-all font-semibold text-ink">{p.address}</span>
                <span className="text-sm text-muted">{when(p.at)}</span>
              </div>
              {p.subject && <p className="mt-1.5 text-sm text-body">“{p.subject}”</p>}
              {p.detail && <p className="mt-1 text-sm text-muted">{p.detail}</p>}
              <p className="mt-2 text-sm text-body">
                {p.guests.length === 0
                  ? 'No guest uses this address (support or an organizer).'
                  : p.guests.map((g, i) => (
                      <span key={`${g.tripId}-${i}`}>
                        {i > 0 && ' · '}
                        {g.name} on{' '}
                        <Link
                          to={`/admin/trips/${g.tripId}/control`}
                          className="font-semibold text-royal underline"
                        >
                          {g.tripName}
                        </Link>{' '}
                        ({g.open ? 'waiting for the organizer' : 'fixed'})
                      </span>
                    ))}
              </p>
            </li>
          ))}
        </ul>
      )}
      <AdminHow to="/admin/email-problems" />
    </AdminShell>
  )
}
