import type { AdminMetric, AdminMetrics } from '@cc/types'
import { HandCoins, Luggage, Users, type LucideIcon } from 'lucide-react'
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
          <Stat icon={Luggage} label="Trips created" metric={metrics.trips} />
          <Stat icon={HandCoins} label="Payments tracked" metric={metrics.payments}>
            <p className="text-body">
              <span className="font-semibold">{money(metrics.paymentCents.total)}</span> recorded,{' '}
              {money(metrics.paymentCents.recent)} in the last 30 days
            </p>
            <p className="text-sm text-muted">
              {count(metrics.paymentsWaiting)} more waiting for an organizer to confirm
            </p>
          </Stat>
        </div>
      )}
      <AdminHow to="/admin/metrics" />
    </AdminShell>
  )
}
