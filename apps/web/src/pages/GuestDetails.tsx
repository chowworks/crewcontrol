// A guest's Details dialog in Trip Control (owner's choice, 2026-10-26, "option B"): contact info in a purple panel,
// what's paid on one line, then two tabs, Payments and Trip Status & Room.
import type { Guest, Payment, TripRoom } from '@cc/types'
import { useState } from 'react'
import { Dialog } from '@/components/Dialog'
import { money } from '@/lib/format'
import { Spot } from './ControlPanelPage'
import { Contact, PaymentLine, type DetailsProps } from './TripGuests'

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

const outlined =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale'

/** The parts of the dialog: the payments list, Log a payment, the room choice, and the buttons to other dialogs. */
function useParts(props: DetailsProps) {
  const { g, trip, rooms, onUpdate, onDecide, onRead, onHistory, onReview, onLogOpen, onClose } =
    props
  const canLog =
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
  const list = (
    <>
      {g.payments.length > 0 ? (
        <ul>
          {g.payments.map((p: Payment) => (
            <PaymentLine
              key={p.id}
              p={p}
              g={g}
              onReview={() => {
                onClose()
                onReview(g, p)
              }}
              onDecide={onDecide}
            />
          ))}
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
          disabled={g.status === 'declined'}
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
  return { logButton, list, room, records }
}

/**
 * What's paid on one line (owner's call, 2026-10-26): the amount paid, a slim bar, and what's left. The fill fades
 * from deep to royal purple; the words carry the meaning for screen readers.
 */
function PaidBar({ terms }: { terms: NonNullable<Guest['terms']> }) {
  const pct = terms.priceCents
    ? Math.min(100, Math.round((terms.paidCents / terms.priceCents) * 100))
    : 0
  return (
    <div className="mb-4">
      <h3 className="mb-1.5 text-sm font-semibold text-muted">Paid so far</h3>
      <div className="flex items-center gap-3 text-sm">
        <span className="whitespace-nowrap font-semibold text-ink">
          {money(terms.paidCents)}{' '}
          <span className="font-normal text-muted">of {money(terms.priceCents)}</span>
        </span>
        <span
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${money(terms.paidCents)} of ${money(terms.priceCents)} paid`}
          className="h-2.5 flex-1 overflow-hidden rounded-full bg-royal-pale"
        >
          <span
            className="block h-full rounded-full bg-gradient-to-r from-royal-dark to-royal"
            style={{ width: `${pct}%` }}
          />
        </span>
        <span className="whitespace-nowrap text-muted">{money(terms.balanceCents)} left</span>
      </div>
    </div>
  )
}

export function GuestDetails(props: DetailsProps) {
  const { g, trip, full, onUpdate, onClose, error } = props
  const { logButton, list, room, records } = useParts(props)
  const [tab, setTab] = useState<'payments' | 'spot'>('payments')
  const tabs = [
    { key: 'payments', label: `Payments${g.payments.length ? ` (${g.payments.length})` : ''}` },
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
            {logButton && <div>{logButton}</div>}
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
              </dl>
              {records}
            </section>
          </div>
        )}
      </div>
    </Dialog>
  )
}
