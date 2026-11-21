import type { AdminMetric, AdminMetrics } from '@cc/types'
import { Bot, HandCoins, Luggage, Users, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { api } from '@/lib/api'
import { money } from '@/lib/format'
import { AdminHow, AdminShell, AdminToolHead } from './AdminPage'
import { IconCircle } from './TripGuests'

const count = (n: number) => n.toLocaleString('en-US')

/** One number: its icon and name, the all-time total, and the last 30 days under it. */
function Stat({
  icon,
  label,
  metric,
  show = count,
  children,
}: {
  icon: LucideIcon
  label: string
  metric: AdminMetric
  show?: (n: number) => string
  children?: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-white p-5 shadow-card sm:p-6">
      <h2 className="flex items-center gap-3 text-lg font-bold">
        <IconCircle icon={icon} />
        {label}
      </h2>
      <p className="text-4xl font-extrabold">{show(metric.total)}</p>
      <p className="text-body">
        <span className="font-semibold">{show(metric.recent)}</span> in the last 30 days
      </p>
      {children}
    </section>
  )
}

/** Every payment logged, by who logged it, with each one's share. */
function LoggedBy({ by }: { by: AdminMetrics['loggedBy'] }) {
  const all = by.guest + by.organizer + by.email
  const share = (n: number) => (all ? ` (${Math.round((n / all) * 100)}%)` : '')
  return (
    <div className="mt-2 border-t border-rule pt-3 text-sm text-body">
      <p className="font-semibold">Who logged them ({count(all)} in all)</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        <li>
          Guests: {count(by.guest)}
          {share(by.guest)}
        </li>
        <li>
          Organizers: {count(by.organizer)}
          {share(by.organizer)}
        </li>
        <li>
          Forwarded receipts: {count(by.email)}
          {share(by.email)}
        </li>
      </ul>
    </div>
  )
}

/** Requests turned away before any route (scanners): the last 24 hours, the last 7 days and what they asked for. */
function BotRequests({ bots }: { bots: AdminMetrics['botRequests'] }) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-white p-5 shadow-card sm:p-6">
      <h2 className="flex items-center gap-3 text-lg font-bold">
        <IconCircle icon={Bot} />
        Bot requests
      </h2>
      <p className="text-4xl font-extrabold">{count(bots.day)}</p>
      <p className="text-body">
        <span className="font-semibold">in the last 24 hours</span>, {count(bots.week)} in the last
        7 days
      </p>
      {bots.topPaths.length > 0 && (
        <div className="mt-2 border-t border-rule pt-3 text-sm text-body">
          <p className="font-semibold">Most asked for (7 days)</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {bots.topPaths.map((p) => (
              <li key={p.path} className="flex justify-between gap-3">
                <span className="min-w-0 break-all font-mono text-xs leading-5">{p.path}</span>
                <span className="shrink-0">
                  {count(p.count)}
                  <span className="sr-only"> requests</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/**
 * Admin toolbox → Metrics: how many people use Travel HQ, the trips they made and the payments they tracked, all time
 * and the last 30 days. Sample trips are left out (admin_metrics).
 */
export function AdminMetricsPage() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .adminMetrics()
      .then(setMetrics)
      .catch(() => setError('The metrics could not be loaded.'))
  }, [])

  return (
    <AdminShell>
      <AdminToolHead to="/admin/metrics" />
      {error && (
        <p role="alert" className="mb-4 font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      {!metrics && !error && <p className="text-muted">Loading…</p>}
      {metrics && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Stat icon={Users} label="People" metric={metrics.users} />
          <Stat icon={Luggage} label="Trips created" metric={metrics.trips}>
            <p className="text-body">
              <span className="font-semibold">{count(metrics.liveTrips)}</span> live: published,
              with an accepted guest
            </p>
          </Stat>
          <Stat icon={HandCoins} label="Payments tracked" metric={metrics.payments}>
            <p className="text-body">
              <span className="font-semibold">{money(metrics.paymentCents.total)}</span> recorded,{' '}
              {money(metrics.paymentCents.recent)} in the last 30 days
            </p>
            <p className="text-sm text-muted">
              {count(metrics.paymentsWaiting)} more waiting for an organizer to confirm
            </p>
            <LoggedBy by={metrics.loggedBy} />
          </Stat>
          {metrics.botRequests && <BotRequests bots={metrics.botRequests} />}
        </div>
      )}
      <AdminHow to="/admin/metrics" />
    </AdminShell>
  )
}
