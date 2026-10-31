import type { AdminSentEmail, AdminSentEmails, EmailSendStatus } from '@cc/types'
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Send,
  ShieldAlert,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Dropdown } from '@/components/Dropdown'
import { api } from '@/lib/api'
import { AdminHow, AdminShell, AdminToolHead } from './AdminPage'
import {
  Addr,
  Chip,
  Pager,
  SearchBox,
  useSearchPages,
  type Tone,
} from './AdminForwardedReceiptsPage'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

// Solid chips, as on Forwarded receipts: on its way grey, delivered royal, delayed marigold, didn't arrive red.
const STATUS: Record<EmailSendStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  sent: { label: 'Sent', tone: 'muted', icon: Send },
  delivered: { label: 'Delivered', tone: 'ok', icon: CheckCircle2 },
  delayed: { label: 'Delayed', tone: 'warn', icon: Clock },
  bounced: { label: 'Bounced', tone: 'danger', icon: XCircle },
  blocked: { label: 'Blocked: bounced before', tone: 'danger', icon: Ban },
  complained: { label: 'Marked as spam', tone: 'danger', icon: ShieldAlert },
  failed: { label: 'Failed', tone: 'danger', icon: AlertTriangle },
  mocked: { label: 'Not sent: email off here', tone: 'muted', icon: Ban },
  not_deliverable: { label: 'Not sent: test address', tone: 'muted', icon: Ban },
}
const STATUSES = Object.keys(STATUS) as EmailSendStatus[]

const tripLink = (e: AdminSentEmail) =>
  e.tripId && e.tripName ? (
    <Link to={`/admin/trips/${e.tripId}/control`} className="font-semibold text-royal underline">
      {e.tripName}
    </Link>
  ) : (
    <span className="text-muted">No trip</span>
  )

function StatusCell({ e }: { e: AdminSentEmail }) {
  const s = STATUS[e.status]
  return (
    <>
      <Chip tone={s.tone} icon={s.icon}>
        {s.label}
      </Chip>
      {e.status !== 'sent' && e.statusAt !== e.sentAt && (
        <span className="block text-xs text-muted">{when(e.statusAt)}</span>
      )}
      {e.detail && <span className="mt-1 block text-sm text-body">{e.detail}</span>}
      {e.resendId && (
        <span className="mt-1 block break-all font-mono text-xs text-muted">
          Resend id {e.resendId}
        </span>
      )}
    </>
  )
}

/**
 * Admin toolbox → Sent Emails: every email Travel HQ sent in the last 30 days, newest first, with what Resend said
 * became of it. Envelope only: what an email said is never kept.
 */
export function AdminSentEmailsPage() {
  const [data, setData] = useState<AdminSentEmails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState('')
  const [status, setStatus] = useState<EmailSendStatus | ''>('')

  useEffect(() => {
    api
      .adminSentEmails()
      .then(setData)
      .catch(() => setError('The sent emails could not be loaded.'))
  }, [])

  const filtered = useMemo(
    () =>
      (data?.emails ?? []).filter(
        (e) => (!kind || e.kind === kind) && (!status || e.status === status)
      ),
    [data, kind, status]
  )
  const list = useSearchPages(filtered, (e) => [e.tripName, e.to, e.subject, e.resendId])
  const emails = list.shown

  return (
    <AdminShell>
      <AdminToolHead to="/admin/sent-emails" />
      <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-card sm:p-6">
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        {!data && !error && <p className="text-body">Loading…</p>}
        {data && (
          <p className="text-sm text-muted">
            Emails are kept for 30 days, then deleted. Only who, what kind and when is kept, never
            what an email said.
          </p>
        )}
        {data && data.emails.length === 0 && <p className="text-body">No emails sent yet.</p>}
        {data && data.emails.length > 0 && (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <Dropdown
                label="Email"
                value={kind}
                options={[
                  { value: '', label: 'Every email' },
                  ...data.kinds.map((k) => ({ value: k.kind, label: k.name })),
                ]}
                onChange={(v) => {
                  setKind(v)
                  list.setPage(0)
                }}
              />
              <Dropdown
                label="Status"
                value={status}
                options={[
                  { value: '' as const, label: 'Every status' },
                  ...STATUSES.map((s) => ({ value: s, label: STATUS[s].label })),
                ]}
                onChange={(v) => {
                  setStatus(v)
                  list.setPage(0)
                }}
              />
            </div>
            <SearchBox
              list={list}
              label="Search sent emails"
              placeholder="Search by trip, address, subject or Resend id"
              noun="email"
            />
          </>
        )}
        {emails.length > 0 && (
          <>
            {/* A table from tablet width; on a phone, one block per email. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="text-xs font-semibold text-muted">
                  <tr className="border-b border-rule">
                    <th className="py-2 pr-3">Sent</th>
                    <th className="py-2 pr-3">To</th>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Trip</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {emails.map((e) => (
                    <tr key={e.id} className="border-b border-rule align-top last:border-b-0">
                      <td className="whitespace-nowrap py-3 pr-3 text-muted">{when(e.sentAt)}</td>
                      <td className="max-w-[220px] py-3 pr-3">
                        <Addr value={e.to} />
                      </td>
                      <td className="py-3 pr-3">
                        <span className="block font-semibold">{e.kindName}</span>
                        <span className="text-muted">{e.subject}</span>
                      </td>
                      <td className="py-3 pr-3">{tripLink(e)}</td>
                      <td className="py-3">
                        <StatusCell e={e} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="flex flex-col md:hidden">
              {emails.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-col gap-1 border-b border-rule py-3 text-sm last:border-b-0"
                >
                  <span className="font-semibold">{e.kindName}</span>
                  <span className="text-muted">{e.subject}</span>
                  <span>
                    To <Addr value={e.to} />
                  </span>
                  <span>
                    {tripLink(e)} · <span className="text-muted">{when(e.sentAt)}</span>
                  </span>
                  <span>
                    <StatusCell e={e} />
                  </span>
                </li>
              ))}
            </ul>
            <Pager list={list} />
          </>
        )}
      </section>
      <AdminHow to="/admin/sent-emails" />
    </AdminShell>
  )
}
