// The travelers someone signed up and looks after (issue #11), as a family summary (owner's pick, 2026-10-29): what's
// due now for everyone with one "I've paid", then a card per traveler with where they stand, a paid bar and Details.
import { paymentMethodLabel, type JoinView, type MyGuest } from '@cc/types'
import { Users } from 'lucide-react'
import { useState } from 'react'
import { Dialog } from '@/components/Dialog'
import { money } from '@/lib/format'
import { owed, totalDueCents } from '@/lib/payments'
import { MyPayments, payees, travelerStatus } from './JoinPage'

const primary =
  'min-h-[52px] rounded-xl bg-royal px-5 text-[17px] font-semibold text-white hover:bg-royal-dark'
const outlined =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-royal px-4 font-semibold text-royal hover:bg-royal-pale'

export function PaidBar({ g }: { g: MyGuest }) {
  if (!g.terms) return null
  const paid = g.terms.paidCents
  const due = totalDueCents(g.terms)
  const pct = due ? Math.min(100, Math.round((paid / due) * 100)) : 0
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${g.firstName}: paid so far`}
      className="h-2 w-full overflow-hidden rounded-full bg-royal-pale"
    >
      <div className="h-full rounded-full bg-royal" style={{ width: `${pct}%` }} />
    </div>
  )
}

const initials = (g: MyGuest) => `${g.firstName[0] ?? ''}${g.lastName[0] ?? ''}`.toUpperCase()

function HowToPay({ g, organizer }: { g: MyGuest; organizer: string }) {
  if (g.paymentMethods.length === 0 && !g.paymentInstructions) return null
  return (
    <div className="text-ink">
      <p className="text-sm font-semibold">How to pay {organizer}</p>
      {g.paymentMethods.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5">
          {g.paymentMethods.map((m, i) => (
            <li key={i}>{paymentMethodLabel(m)}</li>
          ))}
        </ul>
      )}
      {g.paymentInstructions && (
        <p className="mt-2 whitespace-pre-line text-sm">{g.paymentInstructions}</p>
      )}
    </div>
  )
}

/** One traveler's payments and agreement, opened from their card. */
function TravelerDialog({ g, view, onClose }: { g: MyGuest; view: JoinView; onClose: () => void }) {
  const [reading, setReading] = useState(false)
  return (
    <Dialog title={`${g.firstName} ${g.lastName}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="font-semibold text-royal">{travelerStatus(view.trip, g)}</p>
        {g.terms && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted">Price</dt>
              <dd className="font-semibold">{money(g.terms.priceCents)}</dd>
            </div>
            {g.terms.adjustmentCents !== 0 && (
              <div>
                <dt className="text-muted">Credits and charges</dt>
                <dd className="font-semibold">
                  {`${g.terms.adjustmentCents < 0 ? '−' : '+'}${money(Math.abs(g.terms.adjustmentCents))}`}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-muted">Left to pay</dt>
              <dd className="font-semibold">{money(g.terms.balanceCents)}</dd>
            </div>
          </dl>
        )}
        {g.payments.length > 0 || g.adjustments.length > 0 ? (
          <MyPayments
            payments={g.payments}
            adjustments={g.adjustments}
            organizer={view.trip.organizerName}
            title="Transaction history"
          />
        ) : (
          <p className="text-sm text-muted">No payments yet.</p>
        )}
        {g.agreement &&
          (reading ? (
            <div className="whitespace-pre-line rounded-xl bg-ground p-4 text-[15px] text-body">
              {g.agreement.text}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setReading(true)}
              className={`${outlined} self-start`}
            >
              Read {g.firstName}’s agreement
            </button>
          ))}
      </div>
    </Dialog>
  )
}

interface TravelersProps {
  view: JoinView
  /** "I've paid" / "Pay": opens the payment dialog. */
  onPay: () => void
  onAdd: () => void
  onJoinMyself: () => void
}

/** The card itself; JoinPage keeps the dialogs it opens (adding a traveler, joining, paying). */
export function TravelersCard({ view, onPay, onAdd, onJoinMyself }: TravelersProps) {
  const { trip, me, managed } = view
  const [open, setOpen] = useState<MyGuest | null>(null)
  const people = payees(view)
  const everyone = me ? [me, ...managed] : managed
  const dueNow = people.reduce((n, g) => n + owed(g.terms!).dueNow, 0)
  const left = everyone.reduce((n, g) => n + (g.terms?.balanceCents ?? 0), 0)
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-card sm:p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-royal-pale text-royal">
          <Users className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-xl font-extrabold">Your travelers</h2>
          <p className="text-sm text-body">
            {managed.length} {managed.length === 1 ? 'traveler' : 'travelers'} you look after ·{' '}
            {money(left)} left to pay in all
          </p>
        </div>
      </div>
      {people.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl bg-royal-pale p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold text-ink">Due now</span>
            <span className="text-2xl font-extrabold text-ink">
              {dueNow > 0 ? money(dueNow) : 'Nothing'}
            </span>
          </div>
          <HowToPay g={people[0]} organizer={trip.organizerName} />
          <button type="button" onClick={onPay} className={primary}>
            I’ve paid
          </button>
        </div>
      )}
      <ul className="flex flex-col gap-2.5">
        {managed.map((g) => (
          <li key={g.id} className="flex items-center gap-3 rounded-xl border border-rule p-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-royal-pale font-bold text-royal">
              {initials(g)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-bold text-ink">
                  {g.firstName} {g.lastName}
                </span>
                <span className="rounded-full bg-royal-pale px-2.5 py-0.5 text-xs font-semibold text-royal">
                  {travelerStatus(trip, g)}
                </span>
              </span>
              <PaidBar g={g} />
              {g.terms && (
                <span className="text-sm text-body">
                  {money(g.terms.paidCents)} of {money(totalDueCents(g.terms))} paid
                </span>
              )}
            </span>
            <button type="button" onClick={() => setOpen(g)} className={`${outlined} shrink-0`}>
              Details
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onAdd} className={outlined}>
          Add another traveler
        </button>
        {!me && (
          <button type="button" onClick={onJoinMyself} className={outlined}>
            I’m going too
          </button>
        )}
      </div>
      {open && <TravelerDialog g={open} view={view} onClose={() => setOpen(null)} />}
    </section>
  )
}
