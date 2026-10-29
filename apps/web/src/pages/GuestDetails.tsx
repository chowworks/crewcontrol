// A guest's Details dialog in Trip Control (owner's choice, 2026-10-26, "option B"): contact info in a purple panel,
// what's paid on one line, then two tabs, Payments and Trip Status & Room.
import type { Guest, Payment, TripRoom } from '@cc/types'
import { useState } from 'react'
import { useAdminView } from '@/components/AdminView'
import { Dialog } from '@/components/Dialog'
import { money } from '@/lib/format'
import { totalDueCents } from '@/lib/payments'
import { AdjustmentLine } from './AdjustBalance'
import { Spot } from './ControlPanelPage'
import { Contact, PaymentLine, type DetailsProps } from './TripGuests'

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

const outlined =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale'

/** The parts of the dialog: the payments list, Log a payment, the room choice, and the buttons to other dialogs. */
function useParts(props: DetailsProps) {
  const {
    g,
    trip,
    rooms,
    onUpdate,
    onDecide,
    onRead,
    onHistory,
    onReview,
    onLogOpen,
    onAdjustOpen,
    onRemoveAdjustment,
    onClose,
  } = props
  const admin = useAdminView()
  const canLog =
    !admin &&
    g.status !== 'declined' &&
    !(trip.joinMode === 'accept_first' && g.status !== 'approved') &&
    g.signedAt
  const logButton = canLog ? (
    <button
      type="button"
      onClick={() => {
        onClose()
        onLogOpen(g)
      }}
      className={outlined}
    >
      Log a payment
    </button>
  ) : null
  // A credit or charge sits beside the signed price (issue #17), so only a guest who signed has one.
  const adjustButton =
    !admin && g.status !== 'declined' && g.terms ? (
      <button
        type="button"
        onClick={() => {
          onClose()
          onAdjustOpen(g)
        }}
        className={outlined}
      >
        Add a credit or charge
      </button>
    ) : null
  // One transaction history (owner's call, 2026-10-29): payments, credits and charges together, oldest first.
  const lines = [
    ...g.payments.map((p) => ({ at: p.reportedAt, p, a: null })),
    ...g.adjustments.map((a) => ({ at: a.createdAt, p: null, a })),
  ].sort((x, y) => x.at.localeCompare(y.at))
  const list = (
    <>
      {lines.length > 0 ? (
        <ul>
          {lines.map(({ p, a }) =>
            a ? (
              <AdjustmentLine
                key={a.id}
                a={a}
                g={g}
                onRemove={onRemoveAdjustment}
                readOnly={admin}
              />
            ) : (
              <PaymentLine
                key={p.id}
                p={p as Payment}
                g={g}
                onReview={() => {
                  onClose()
                  onReview(g, p as Payment)
                }}
                onDecide={onDecide}
              />
            )
          )}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          {trip.joinMode === 'accept_first' && g.status !== 'approved'
            ? 'They see how to pay you once you accept them.'
            : 'No payments yet.'}
        </p>
      )}
    </>
  )
  const room =
    rooms.length > 0 ? (
      <div>
        <select
          className="min-h-[44px] w-full rounded-lg border border-rule bg-white px-2"
          value={g.roomId ?? ''}
          onChange={(e) => onUpdate(g, { roomId: e.target.value || null })}
          aria-label={`Room for ${g.firstName}`}
          disabled={admin || g.status === 'declined'}
        >
          <option value="">No room yet</option>
          {rooms
            .filter((r: TripRoom) => r.id)
            .map((r: TripRoom) => (
              <option key={r.id} value={r.id}>
                {r.name} ({trip.guests.filter((x) => x.roomId === r.id).length}/{r.capacity})
              </option>
            ))}
        </select>
        {g.roomNote && (
          <span className="mt-1 block text-sm text-muted">Share with: {g.roomNote}</span>
        )}
      </div>
    ) : null
  const records = (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => {
          onClose()
          onHistory(g)
        }}
        className={outlined}
      >
        History
      </button>
      {g.signedAt ? (
        <button
          type="button"
          onClick={() => {
            onClose()
            onRead(g)
          }}
          className={outlined}
        >
          Signed agreement
        </button>
      ) : (
        <span className="self-center text-sm text-muted">Agreement not signed</span>
      )}
    </div>
  )
  return { logButton, adjustButton, list, room, records }
}

/**
 * What's paid on one line (owner's call, 2026-10-26): the amount paid, a slim bar, and what's left. The fill fades
 * from deep to royal purple; the words carry the meaning for screen readers. With credits or charges, what they owe in
 * all is the signed price with those, and a line under it says so.
 */
function PaidBar({ terms }: { terms: NonNullable<Guest['terms']> }) {
  const due = totalDueCents(terms)
  const pct = due ? Math.min(100, Math.round((terms.paidCents / due) * 100)) : 0
  return (
    <div className="mb-4">
      <h3 className="mb-1.5 text-sm font-semibold text-muted">Paid so far</h3>
      <div className="flex items-center gap-3 text-sm">
        <span className="whitespace-nowrap font-semibold text-ink">
          {money(terms.paidCents)} <span className="font-normal text-muted">of {money(due)}</span>
        </span>
        <span
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${money(terms.paidCents)} of ${money(due)} paid`}
          className="h-2.5 flex-1 overflow-hidden rounded-full bg-royal-pale"
        >
          <span
            className="block h-full rounded-full bg-gradient-to-r from-royal-dark to-royal"
            style={{ width: `${pct}%` }}
          />
        </span>
        <span className="whitespace-nowrap text-muted">{money(terms.balanceCents)} left</span>
      </div>
      {terms.adjustmentCents !== 0 && (
        <p className="mt-1 text-sm text-muted">
          Signed price {money(terms.priceCents)},{' '}
          {terms.adjustmentCents < 0
            ? `less ${money(-terms.adjustmentCents)} in credits.`
            : `plus ${money(terms.adjustmentCents)} in charges.`}
        </p>
      )}
    </div>
  )
}

export function GuestDetails(props: DetailsProps) {
  const { g, trip, full, onUpdate, onClose, onManageOpen, error } = props
  const { logButton, adjustButton, list, room, records } = useParts(props)
  const admin = useAdminView()
  const [tab, setTab] = useState<'payments' | 'spot'>('payments')
  const transactions = g.payments.length + g.adjustments.length
  const tabs = [
    {
      key: 'payments',
      label: `Transactions${transactions ? ` (${transactions})` : ''}`,
    },
    { key: 'spot', label: 'Trip Status & Room' },
  ] as const
  return (
    <Dialog title={`${g.firstName} ${g.lastName}`} onClose={onClose}>
      {/* How to reach them in a purple panel, then what's paid (owner's layout, 2026-10-26). */}
      <div className="-mt-2 mb-3 flex flex-col gap-2 rounded-xl bg-royal-pale px-4 py-3 text-ink">
        <h3 className="text-sm font-semibold">Contact info</h3>
        <dl className="flex flex-col gap-2 text-sm">
          <Contact label="Phone" value={g.phone} />
          <Contact label="Email" value={g.email} />
        </dl>
      </div>
      {error && (
        <p role="alert" className="mb-3 font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      {g.terms && g.status !== 'declined' && <PaidBar terms={g.terms} />}
      <div role="tablist" className="mb-4 flex gap-1 rounded-xl bg-ground p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`min-h-[44px] flex-1 rounded-lg px-2 text-sm font-semibold ${
              tab === t.key ? 'bg-white text-royal shadow-card' : 'text-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="flex flex-col gap-3">
        {tab === 'payments' && (
          <>
            {list}
            {(logButton || adjustButton) && (
              <div className="flex flex-wrap gap-2">
                {logButton}
                {adjustButton}
              </div>
            )}
          </>
        )}
        {tab === 'spot' && (
          <div className="flex flex-col divide-y divide-rule">
            <section className="pb-4">
              <h3 className="mb-1.5 text-sm font-semibold text-muted">Trip status</h3>
              <Spot
                key={g.status}
                guest={g}
                full={full}
                payFirst={trip.joinMode !== 'accept_first'}
                onUpdate={onUpdate}
                row
              />
            </section>
            {room && (
              <section className="py-4">
                <h3 className="mb-1.5 text-sm font-semibold text-muted">Room</h3>
                {room}
              </section>
            )}
            <section className="pt-4">
              <h3 className="mb-1.5 text-sm font-semibold text-muted">Sign-up</h3>
              <dl className="mb-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-muted">Joined</dt>
                  <dd className="font-semibold">{day(g.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Signed</dt>
                  <dd className="font-semibold">{g.signedAt ? day(g.signedAt) : 'Not yet'}</dd>
                </div>
                {/* Who signed them up and pays for them, when it wasn't them (issue #11). */}
                <div className="col-span-2">
                  <dt className="text-muted">Sign-up and payments handled by</dt>
                  <dd className="flex items-center justify-between gap-3 font-semibold">
                    {g.managedBy ? g.managedBy.name : `${g.firstName} themselves`}
                    {!admin && g.status !== 'declined' && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose()
                          onManageOpen(g)
                        }}
                        className={outlined}
                      >
                        Change
                      </button>
                    )}
                  </dd>
                </div>
              </dl>
              {records}
            </section>
          </div>
        )}
      </div>
    </Dialog>
  )
}
