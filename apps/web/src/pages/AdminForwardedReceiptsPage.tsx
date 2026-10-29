import type {
  AdminForwardedReceipt,
  AdminForwardedReceipts,
  AdminReceiptsAddress,
  ForwardedReceiptStatus,
} from '@cc/types'
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Inbox,
  KeyRound,
  Mail,
  RefreshCw,
  Trash2,
  Unlock,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Dropdown } from '@/components/Dropdown'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api'
import { money } from '@/lib/format'
import { AdminHow, AdminShell, AdminToolHead } from './AdminPage'

// Forwarded receipts (issue #12), laid out as Audit Differently's Email administration: every email received with its
// status, refreshed on its own, and "Run again"; then the receipts addresses, in use and used before, with Release.

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const filled =
  'inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-lg bg-royal px-3 text-sm font-semibold text-white hover:bg-royal-dark disabled:opacity-60'
const outlined =
  'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale disabled:opacity-60'

type Tone = 'muted' | 'ok' | 'warn' | 'danger'
const TONES: Record<Tone, string> = {
  muted: 'bg-[#E4E8EC] text-ink',
  ok: 'bg-royal text-white',
  warn: 'bg-marigold text-ink',
  danger: 'bg-[#B42318] text-white',
}

// Solid chips, told apart by colour and an icon: waiting grey, recorded royal, waiting for the organizer or failed
// marigold (a failure usually passes: run it again), refused red (a deliberate no).
const STATUS: Record<ForwardedReceiptStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  received: { label: 'Waiting', tone: 'muted', icon: RefreshCw },
  processing: { label: 'Being read', tone: 'muted', icon: RefreshCw },
  recorded: { label: 'Recorded', tone: 'ok', icon: CheckCircle2 },
  unmatched: { label: 'Waiting for the organizer', tone: 'warn', icon: Inbox },
  dismissed: { label: 'Dismissed', tone: 'muted', icon: Trash2 },
  rejected: { label: 'Refused', tone: 'danger', icon: Ban },
  failed: { label: 'Failed', tone: 'warn', icon: AlertTriangle },
}

function Chip({
  tone,
  icon: Icon,
  children,
}: {
  tone: Tone
  icon: LucideIcon
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </span>
  )
}

function StatusCell({ r }: { r: AdminForwardedReceipt }) {
  const s = STATUS[r.status]
  return (
    <>
      <Chip tone={s.tone} icon={s.icon}>
        {s.label}
      </Chip>
      <span className="block text-xs text-muted">
        {r.attempts} {r.attempts === 1 ? 'attempt' : 'attempts'}
        {r.amountCents !== null && ` · ${money(r.amountCents)} read`}
        {r.fromAddress && (r.senderVerified ? ' · sender checked' : ' · sender not checked')}
      </span>
      {r.reason && <span className="mt-1 block text-sm text-body">{r.reason}</span>}
      {r.error && <span className="block text-xs text-muted">{r.error}</span>}
    </>
  )
}

/** The heading over a group of cards, with its icon in a royal-pale circle. */
function SectionHead({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <h2 className="mb-3 flex items-center gap-3 border-b border-rule pb-2 text-xl font-extrabold">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-royal-pale text-royal">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      {title}
    </h2>
  )
}

function Card({
  title,
  aside,
  children,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-extrabold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** An email address that wraps at the @ on a narrow screen, not mid-word. */
const Addr = ({ value }: { value: string | null }) => {
  if (!value) return <>—</>
  const at = value.indexOf('@')
  return at < 0 ? (
    <>{value}</>
  ) : (
    <span className="[overflow-wrap:anywhere]">
      {value.slice(0, at)}
      <wbr />
      <span className="whitespace-nowrap">{value.slice(at)}</span>
    </span>
  )
}

const tripLink = (tripId: string | null, name: string | null) =>
  tripId && name ? (
    <Link to={`/admin/trips/${tripId}/control`} className="font-semibold text-royal underline">
      {name}
    </Link>
  ) : (
    <span className="text-muted">{tripId ? 'Deleted trip' : 'No trip'}</span>
  )

const EVERY = [
  { value: 0, label: 'Auto-refresh off' },
  { value: 10, label: 'Refresh every 10 seconds' },
  { value: 30, label: 'Refresh every 30 seconds' },
  { value: 60, label: 'Refresh every minute' },
]

/** Admin toolbox → Forwarded receipts. Envelope only: an email's text is never shown here. */
export function AdminForwardedReceiptsPage() {
  const [data, setData] = useState<AdminForwardedReceipts | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [asking, setAsking] = useState<AdminForwardedReceipt | null>(null)
  // The list reloads on Refresh, or as often as Auto-refresh says (every 30 seconds on each visit, never remembered;
  // paused while the tab is hidden). Run again turns it back on, so what became of the email shows here.
  const [every, setEvery] = useState(30)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  // Emails run again, until the list shows what became of them.
  const [pending, setPending] = useState<string[]>([])
  const [outcome, setOutcome] = useState<string | null>(null)
  const toast = useToast()

  const load = async () => {
    setRefreshing(true)
    try {
      const next = await api.adminForwardedReceipts()
      setData(next)
      setUpdatedAt(new Date())
      setError(null)
      const settled = pending.filter((id) => {
        const r = next.emails.find((x) => x.id === id)
        return !r || (r.status !== 'received' && r.status !== 'processing')
      })
      for (const id of settled) {
        const r = next.emails.find((x) => x.id === id)
        setOutcome(
          r
            ? `Read again: ${STATUS[r.status].label.toLowerCase()}.${r.reason ? ` ${r.reason}` : ''}`
            : 'Read again, and it left this list.'
        )
      }
      if (settled.length) setPending((p) => p.filter((id) => !settled.includes(id)))
    } catch {
      setError('The forwarded receipts could not be loaded.')
    } finally {
      setRefreshing(false)
    }
  }
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!every) return
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, every * 1000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [every, pending])

  async function runAgain(r: AdminForwardedReceipt) {
    setAsking(null)
    setBusy(r.id)
    setError(null)
    try {
      setData(await api.adminRunReceiptAgain(r.id))
      setPending((p) => [...p, r.id])
      setEvery((e) => e || 30)
      setOutcome(null)
      toast({ text: 'Back in the queue. What becomes of it shows here.' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work.')
    } finally {
      setBusy(null)
    }
  }

  const controls = (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {updatedAt && (
        <span className="text-muted">Updated {updatedAt.toLocaleTimeString('en-US')}</span>
      )}
      <button type="button" className={outlined} disabled={refreshing} onClick={() => void load()}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
      <Dropdown
        label="Auto-refresh"
        value={every}
        options={EVERY}
        onChange={setEvery}
        className="w-60"
      />
    </div>
  )

  // As Audit Differently's "Not filed", the API lists only what no trip has, or what went wrong: a recorded or matched
  // email is its trip's, and its organizers see it there.
  const emails = data?.emails ?? []
  return (
    <AdminShell>
      <AdminToolHead to="/admin/forwarded-receipts" />
      {data && !data.on && (
        <p className="mb-4 rounded-xl bg-royal-pale px-4 py-3 text-sm text-ink">
          Receiving email isn’t switched on in this environment, so nothing arrives.
        </p>
      )}
      <div className="flex flex-col gap-8">
        <section>
          <SectionHead icon={Mail} title="Emails" />
          <Card title="Not recorded" aside={controls}>
            {error && (
              <p role="alert" className="font-semibold text-[#B42318]">
                {error}
              </p>
            )}
            {outcome && (
              <p className="rounded-xl bg-royal-pale px-4 py-3 text-sm text-ink">{outcome}</p>
            )}
            {!data && !error && <p className="text-body">Loading…</p>}
            {data && emails.length === 0 && (
              <p className="text-body">Nothing to look at. Every email reached its trip.</p>
            )}
            {emails.length > 0 && (
              <>
                {/* A table from tablet width; on a phone, one block per email. */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs font-semibold text-muted">
                      <tr className="border-b border-rule">
                        <th className="py-2 pr-3">Received</th>
                        <th className="py-2 pr-3">Trip</th>
                        <th className="py-2 pr-3">To</th>
                        <th className="py-2 pr-3">From</th>
                        <th className="py-2 pr-3">Subject</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {emails.map((r) => (
                        <tr key={r.id} className="border-b border-rule align-top last:border-b-0">
                          <td className="whitespace-nowrap py-3 pr-3">{when(r.receivedAt)}</td>
                          <td className="py-3 pr-3">{tripLink(r.tripId, r.tripName)}</td>
                          <td className="py-3 pr-3 font-mono text-xs">
                            <Addr value={r.toAddress} />
                          </td>
                          <td className="py-3 pr-3 font-mono text-xs">
                            <Addr value={r.fromAddress} />
                          </td>
                          <td className="py-3 pr-3">
                            {r.subject || <span className="text-muted">(no subject)</span>}
                          </td>
                          <td className="min-w-[200px] py-3 pr-3">
                            <StatusCell r={r} />
                          </td>
                          <td className="py-3 text-right">
                            {r.canRunAgain && (
                              <button
                                type="button"
                                className={filled}
                                disabled={busy === r.id}
                                onClick={() => setAsking(r)}
                              >
                                Run again
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="md:hidden">
                  {emails.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-col gap-1 border-t border-rule py-3 text-sm first:border-t-0"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-muted">{when(r.receivedAt)}</span>
                        {tripLink(r.tripId, r.tripName)}
                      </div>
                      <div className="font-mono text-xs">
                        <Addr value={r.fromAddress} /> → <Addr value={r.toAddress} />
                      </div>
                      <div>{r.subject || <span className="text-muted">(no subject)</span>}</div>
                      <div>
                        <StatusCell r={r} />
                      </div>
                      {r.canRunAgain && (
                        <button
                          type="button"
                          className={`${filled} self-start`}
                          disabled={busy === r.id}
                          onClick={() => setAsking(r)}
                        >
                          Run again
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <AdminHow to="/admin/forwarded-receipts" />
          </Card>
        </section>
        {data && <ReceiptsAddresses data={data} onData={setData} />}
      </div>
      {asking && (
        <ConfirmDialog
          title="Run this email again?"
          confirmLabel="Run again"
          onConfirm={() => void runAgain(asking)}
          onCancel={() => setAsking(null)}
        >
          <p>It goes back in the queue and is read again with the trip as it is now.</p>
        </ConfirmDialog>
      )}
    </AdminShell>
  )
}

/** One trip's addresses used before; a deleted trip's go under one "Deleted trip" heading. */
type Group = { key: string; name: string; tripId: string | null; rows: AdminReceiptsAddress[] }

function byTrip(rows: AdminReceiptsAddress[]): Group[] {
  const groups = new Map<string, Group>()
  for (const r of rows) {
    const key = r.tripName == null ? 'deleted' : r.tripId
    const g = groups.get(key) ?? {
      key,
      name: r.tripName ?? 'Deleted trip',
      tripId: r.tripName == null ? null : r.tripId,
      rows: [],
    }
    g.rows.push(r)
    groups.set(key, g)
  }
  return [...groups.values()].sort((a, b) =>
    a.key === 'deleted' ? 1 : b.key === 'deleted' ? -1 : a.name.localeCompare(b.name)
  )
}

/**
 * Receipts addresses, in two cards: each trip's address in use, and the addresses used before, held and watched (the
 * emails that still arrived since removal, all refused), grouped by trip, so an admin can judge when one is safe to
 * hand out again and release it. A current address is never released.
 */
function ReceiptsAddresses({
  data,
  onData,
}: {
  data: AdminForwardedReceipts
  onData: (d: AdminForwardedReceipts) => void
}) {
  const [releasing, setReleasing] = useState<AdminReceiptsAddress | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const current = data.addresses
    .filter((a) => !a.removedAt)
    .sort((a, b) => (a.tripName ?? '').localeCompare(b.tripName ?? ''))
  // An address in use again (released, then chosen) shows only as current.
  const inUse = new Set(current.map((a) => a.address))
  const previous = byTrip(data.addresses.filter((a) => a.removedAt && !inUse.has(a.address)))

  async function release(a: AdminReceiptsAddress) {
    setBusy(true)
    setError(null)
    try {
      onData(await api.adminReleaseAddress(a.id, a.receivedSinceRemoval))
      setReleasing(null)
      toast({
        text: `Released $<Addr value={a.email ?? a.address} />. Any trip may choose it now.`,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work.')
    } finally {
      setBusy(false)
    }
  }
  const lastFor = (a: AdminReceiptsAddress) =>
    a.releasedAt ? '—' : a.lastReceivedAt ? day(a.lastReceivedAt) : 'None'
  const action = (a: AdminReceiptsAddress) =>
    a.releasedAt ? (
      <span className="inline-flex flex-col items-start gap-0.5 md:items-end">
        <Chip tone="muted" icon={Unlock}>
          Released
        </Chip>
        <span className="text-xs text-muted">
          {day(a.releasedAt)}
          {a.releasedBy && `, by ${a.releasedBy}`}
        </span>
      </span>
    ) : a.canRelease ? (
      <button type="button" className={filled} onClick={() => setReleasing(a)}>
        Release
      </button>
    ) : null

  return (
    <section>
      <SectionHead icon={KeyRound} title="Receipts addresses" />
      <div className="flex flex-col gap-6">
        <Card title="Current addresses">
          {current.length === 0 ? (
            <p className="text-body">No trip has chosen an address yet.</p>
          ) : (
            <ul>
              {current.map((a) => (
                <li
                  key={a.id}
                  className="grid gap-x-4 gap-y-0.5 border-t border-rule py-3 text-sm first:border-t-0 md:grid-cols-[1fr_1.4fr_auto]"
                >
                  <span>{tripLink(a.tripId, a.tripName)}</span>
                  <span className="font-mono text-xs">
                    <Addr value={a.email ?? a.address} />
                  </span>
                  <span className="whitespace-nowrap text-muted">
                    In use since {day(a.firstUsedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Previously used addresses">
          {error && (
            <p role="alert" className="font-semibold text-[#B42318]">
              {error}
            </p>
          )}
          {previous.length === 0 ? (
            <p className="text-body">No address has been changed yet.</p>
          ) : (
            <>
              <div className="hidden md:block">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs font-semibold text-muted">
                    <tr className="border-b border-rule">
                      <th className="py-2 pr-3">Address</th>
                      <th className="py-2 pr-3">Removed</th>
                      <th className="py-2 pr-3 text-right">Emails since removal</th>
                      <th className="py-2 pr-3">Last received</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  {previous.map((g) => (
                    <tbody key={g.key}>
                      <tr>
                        <th colSpan={5} scope="colgroup" className="bg-ground px-2 py-1.5">
                          {g.name}
                        </th>
                      </tr>
                      {g.rows.map((a) => (
                        <tr key={a.id} className="border-b border-rule align-top">
                          <td className="py-3 pr-3 font-mono text-xs">
                            <Addr value={a.email ?? a.address} />
                          </td>
                          <td className="whitespace-nowrap py-3 pr-3">
                            {a.removedAt && day(a.removedAt)}
                          </td>
                          <td className="py-3 pr-3 text-right">
                            {a.releasedAt ? '—' : a.receivedSinceRemoval}
                          </td>
                          <td className="whitespace-nowrap py-3 pr-3">{lastFor(a)}</td>
                          <td className="py-3 text-right">{action(a)}</td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
              <div className="flex flex-col gap-4 md:hidden">
                {previous.map((g) => (
                  <div key={g.key}>
                    <h4 className="rounded-lg bg-ground px-2 py-1.5 text-sm font-bold">{g.name}</h4>
                    <ul>
                      {g.rows.map((a) => (
                        <li
                          key={a.id}
                          className="flex flex-col gap-1 border-t border-rule py-3 text-sm first:border-t-0"
                        >
                          <span className="font-mono text-xs">
                            <Addr value={a.email ?? a.address} />
                          </span>
                          <span className="text-muted">
                            Removed {a.removedAt && day(a.removedAt)}
                            {!a.releasedAt &&
                              ` · ${a.receivedSinceRemoval} since removal · last ${lastFor(a)}`}
                          </span>
                          <span className="self-start">{action(a)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
          <details className="text-[13px] text-muted">
            <summary className="cursor-pointer font-semibold">How this works</summary>
            <ul className="mt-1 list-disc pl-5">
              <li>
                When organizers change a trip’s address, or a trip is deleted, the old one is held.
              </li>
              <li>Mail still sent to it is refused and counted under Emails since removal.</li>
              <li>Release it once its mail has stopped; any trip may then choose it.</li>
              <li>A current address is never released.</li>
            </ul>
          </details>
        </Card>
      </div>
      {releasing && (
        <ConfirmDialog
          title="Release this address?"
          confirmLabel="Release address"
          disabled={busy}
          onConfirm={() => void release(releasing)}
          onCancel={() => setReleasing(null)}
        >
          {error && (
            <p role="alert" className="mb-3 font-semibold text-[#B42318]">
              {error}
            </p>
          )}
          <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted">Trip</dt>
            <dd>{releasing.tripName ?? 'Deleted trip'}</dd>
            <dt className="text-muted">Address</dt>
            <dd className="font-mono text-xs">
              <Addr value={releasing.email ?? releasing.address} />
            </dd>
            {releasing.removedAt && (
              <>
                <dt className="text-muted">Removed</dt>
                <dd>{day(releasing.removedAt)}</dd>
              </>
            )}
          </dl>
          <p className="mb-2 font-semibold">
            {releasing.receivedSinceRemoval === 0 || !releasing.lastReceivedAt
              ? 'No email has arrived since it was removed.'
              : `${releasing.receivedSinceRemoval} ${releasing.receivedSinceRemoval === 1 ? 'email has' : 'emails have'} arrived since it was removed, the last on ${day(releasing.lastReceivedAt)}.`}
          </p>
          <p>Any trip can then choose it, and mail sent to it lands there.</p>
        </ConfirmDialog>
      )}
    </section>
  )
}
