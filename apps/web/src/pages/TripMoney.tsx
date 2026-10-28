// Trip Control's Trip Financials section (owner's decision, 2026-10-26): the trip's money at a glance, the totals and one line
// per guest, and the two spreadsheet exports. Everything comes from the trip already loaded: payments are a log
// (confirmed, waiting, not received, refunded), and each guest's price comes from the agreement they signed.
import type { Expense, Guest, OrganizerTrip, Payment } from '@cc/types'
import { DollarSign, Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAdminView } from '@/components/AdminView'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api'
import { money } from '@/lib/format'
import { amount, downloadCsv, fileSlug, stamp } from '@/lib/csv'
import { signupOrder } from '@/lib/signups'
import { Expenses } from './TripExpenses'
import { IconCircle } from './TripGuests'

const sum = (payments: Payment[], status: Payment['status'], arrived = true) =>
  payments
    .filter((p) => p.status === status)
    .reduce((n, p) => n + ((arrived ? p.receivedPaymentAmount : p.guestPaymentAmount) ?? 0), 0)

/** One guest's money: their price, what arrived, what's waiting for the organizer, what was refunded, and what's left. */
function moneyOf(g: Guest) {
  const paid = sum(g.payments, 'confirmed')
  const waiting = sum(g.payments, 'reported', false)
  const refunded = sum(g.payments, 'refunded')
  const price = g.terms?.priceCents ?? 0
  return { price, paid, waiting, refunded, left: g.terms ? Math.max(0, price - paid) : 0 }
}

const STATUS: Record<Guest['status'], string> = {
  approved: 'Accepted',
  interested: 'Waiting',
  declined: 'Turned down',
}
const statusOf = (g: Guest) =>
  g.status === 'interested' && g.waitlistedAt && !g.offeredAt ? 'Waitlist' : STATUS[g.status]

const outlined =
  'inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale'

export function MoneyCard({ trip }: { trip: OrganizerTrip }) {
  const admin = useAdminView()
  const toast = useToast()
  // Vendor costs load on their own: they're the organizer's, never part of the trip guests and the public page see.
  const [expenses, setExpenses] = useState<Expense[] | null>(null)
  // An optional part (owner's decision, 2026-10-28): only for trips that turned it on.
  const tracksCosts = trip.options.vendorCosts
  useEffect(() => {
    if (!tracksCosts) return setExpenses(null)
    api.getExpenses(trip.id, admin).then(setExpenses, () => setExpenses([]))
  }, [trip.id, admin, tracksCosts])
  const line = signupOrder(trip.guests)
  const rows = line.map((g) => ({ g, m: moneyOf(g) }))
  const accepted = rows.filter((r) => r.g.status === 'approved')
  const totals = {
    // What the accepted crew agreed to pay, and what they still owe.
    agreed: accepted.reduce((n, r) => n + r.m.price, 0),
    owed: accepted.reduce((n, r) => n + r.m.left, 0),
    // Money that arrived (anyone's, waiting guests' too), reported and not yet confirmed, and sent back.
    collected: rows.reduce((n, r) => n + r.m.paid, 0),
    waiting: rows.reduce((n, r) => n + r.m.waiting, 0),
    refunded: rows.reduce((n, r) => n + r.m.refunded, 0),
  }
  const file = fileSlug(trip.name)

  function exportGuests() {
    downloadCsv(`${file}-guests-and-balances`, [
      [
        'Guest',
        'Trip Status',
        'Total Price',
        'Total Paid',
        'Total Pending Confirmation',
        'Total Refund',
        'Balance',
        'Joined',
        'Spot Paid',
      ],
      ...rows.map(({ g, m }) => [
        `${g.firstName} ${g.lastName}`.trim(),
        statusOf(g),
        g.terms ? amount(m.price) : null,
        amount(m.paid),
        amount(m.waiting),
        amount(m.refunded),
        g.terms ? amount(m.left) : null,
        stamp(g.createdAt),
        stamp(g.spotPaidAt),
      ]),
    ])
    toast({ text: 'Downloaded Guests and balances.' })
  }

  function exportPayments() {
    const STATUSES: Record<Payment['status'], string> = {
      reported: 'Pending confirmation',
      confirmed: 'Confirmed',
      not_received: 'Not received',
      refunded: 'Refunded',
    }
    downloadCsv(`${file}-payments`, [
      [
        'Guest',
        'Payment Amount Sent',
        'Payment Amount Confirmed',
        'Payment Status',
        'Payment Method',
        'Payment Sent Date',
        'Note',
        'Payment Reported Date',
        'Payment Confirmed Date',
        'Entered By',
      ],
      ...line.flatMap((g) =>
        g.payments.map((p) => [
          `${g.firstName} ${g.lastName}`.trim(),
          amount(p.guestPaymentAmount),
          amount(p.receivedPaymentAmount),
          STATUSES[p.status],
          p.method,
          p.sentOn,
          p.note,
          stamp(p.reportedAt),
          stamp(p.decidedAt),
          p.loggedBy === 'organizer' ? 'Organizer' : 'Guest',
        ])
      ),
    ])
    toast({ text: 'Downloaded Every payment.' })
  }

  function exportExpenses() {
    downloadCsv(`${file}-vendor-costs`, [
      ['Paid To', 'For', 'Amount', 'Status', 'Paid Date', 'Due Date', 'Added'],
      ...(expenses ?? []).map((e) => [
        e.payee,
        e.description,
        amount(e.amountCents),
        e.paidOn ? 'Paid' : 'Owed',
        e.paidOn,
        e.dueOn,
        stamp(e.createdAt),
      ]),
    ])
    toast({ text: 'Downloaded Vendor costs.' })
  }

  // The picture of the trip's money (owner's ask, 2026-10-26: more visual, and no guest list, which Manage Guests
  // already shows): what the accepted crew agreed to pay, split into what arrived, what's waiting for the organizer
  // and what's still to come.
  const acceptedPaid = accepted.reduce((n, r) => n + Math.min(r.m.paid, r.m.price), 0)
  const acceptedWaiting = accepted.reduce(
    (n, r) => n + Math.min(r.m.waiting, Math.max(0, r.m.price - r.m.paid)),
    0
  )
  const toCome = Math.max(0, totals.agreed - acceptedPaid - acceptedWaiting)
  const pct = (cents: number) => (totals.agreed ? (cents / totals.agreed) * 100 : 0)
  const paidUp = accepted.filter((r) => r.g.terms && r.m.left === 0).length
  // Where the money arrived, so it can be checked against Zelle, Cash App and the rest.
  const byMethod = new Map<string, number>()
  for (const g of trip.guests)
    for (const p of g.payments)
      if (p.status === 'confirmed') {
        const name = p.method.split(' · ')[0]
        byMethod.set(name, (byMethod.get(name) ?? 0) + (p.receivedPaymentAmount ?? 0))
      }
  const methods = [...byMethod].sort((a, b) => b[1] - a[1])
  const legend = (label: string, cents: number, swatch: string) => (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className={`h-3 w-3 shrink-0 rounded-full ${swatch}`} />
      <span className="text-sm text-muted">{label}</span>
      <span className="ml-auto font-semibold sm:ml-0">{money(cents)}</span>
    </div>
  )
  const stat = (label: string, value: string) => (
    <div className="rounded-xl bg-ground px-4 py-3">
      <div className="text-sm text-muted">{label}</div>
      <div className="font-display text-xl font-extrabold">{value}</div>
    </div>
  )

  return (
    <section className="flex flex-col gap-5 rounded-2xl bg-white p-5 shadow-card sm:p-6">
      <h2 className="flex items-center gap-3 text-xl font-extrabold">
        <IconCircle icon={DollarSign} />
        Trip Financials
      </h2>
      <div>
        <p className="text-body">
          <span className="font-display text-4xl font-extrabold text-ink">
            {money(acceptedPaid)}
          </span>{' '}
          of {money(totals.agreed)} collected
          {totals.agreed > 0 && (
            <span className="text-muted"> · {Math.round(pct(acceptedPaid))}%</span>
          )}
        </p>
        <div
          role="img"
          aria-label={`${money(acceptedPaid)} collected, ${money(acceptedWaiting)} waiting for you, ${money(toCome)} still to come, of ${money(totals.agreed)} agreed`}
          className="mt-3 flex h-4 overflow-hidden rounded-full bg-royal-pale"
        >
          <span className="h-full bg-royal" style={{ width: `${pct(acceptedPaid)}%` }} />
          <span className="h-full bg-royal/40" style={{ width: `${pct(acceptedWaiting)}%` }} />
        </div>
        <div className="mt-3 flex flex-col gap-1.5 sm:flex-row sm:gap-6">
          {legend('Collected', acceptedPaid, 'bg-royal')}
          {legend('Waiting for you', acceptedWaiting, 'bg-royal/40')}
          {legend('Still to come', toCome, 'bg-royal-pale ring-1 ring-inset ring-royal/30')}
        </div>
        <p className="mt-2 text-sm text-muted">
          Counts accepted guests: what they agreed to pay, and what came in toward it.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat('Paid in full', `${paidUp} of ${accepted.length}`)}
        {stat('Waiting for you', money(totals.waiting))}
        {stat('All money in', money(totals.collected))}
        {stat('Refunded', money(totals.refunded))}
      </div>
      {methods.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted">Confirmed, by how it was paid</h3>
          <ul className="flex flex-col gap-2">
            {methods.map(([name, cents]) => (
              <li key={name} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 truncate font-semibold">{name}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-royal-pale">
                  <span
                    className="block h-full rounded-full bg-royal"
                    style={{ width: `${totals.collected ? (cents / totals.collected) * 100 : 0}%` }}
                  />
                </span>
                <span className="w-20 shrink-0 text-right">{money(cents)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {expenses && (
        <Expenses
          trip={trip}
          expenses={expenses}
          onChange={setExpenses}
          collected={totals.collected}
          agreed={totals.agreed}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={exportGuests} className={outlined}>
          <Download className="h-4 w-4" aria-hidden="true" />
          Guests and balances
        </button>
        <button type="button" onClick={exportPayments} className={outlined}>
          <Download className="h-4 w-4" aria-hidden="true" />
          Every payment
        </button>
        {expenses && expenses.length > 0 && (
          <button type="button" onClick={exportExpenses} className={outlined}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Vendor costs
          </button>
        )}
      </div>
      <p className="-mt-2 text-sm text-muted">
        Spreadsheet files (CSV) for Excel, Numbers or Google Sheets. Names and money only, no
        contact details.
      </p>
    </section>
  )
}
