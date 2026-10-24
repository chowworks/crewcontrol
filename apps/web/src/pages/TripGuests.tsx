// Trip Control's two sections (owner's choice, 2026-10-24): Actions at the top, counted in a red badge, each with one
// filled button, and Manage Guests, everyone in line order, one line each. Every change to a guest is in their Details dialog.
import type { Guest, GuestEvent, GuestUpdate, OrganizerTrip, TripRoom } from '@cc/types'
import { Check, Copy, Info, ListChecks, Users, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/Dialog'
import { api } from '@/lib/api'
import { money } from '@/lib/format'
import { signupOrder } from '@/lib/signups'
import { SignedCopy, Spot, UndoConfirm } from './ControlPanelPage'

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

const filled =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg bg-royal px-3 text-sm font-semibold text-white hover:bg-royal-dark'

const outlined =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale'

interface Props {
  trip: OrganizerTrip
  rooms: TripRoom[]
  onUpdate: (guest: Guest, update: GuestUpdate) => void | Promise<void>
  /** Why the last change didn't save, shown in an open Details dialog (the page's own line is behind it). */
  error?: string | null
}

/** The line in order, and whether every spot is taken. */
function lineOf(trip: OrganizerTrip) {
  const line = signupOrder(trip.guests)
  const accepted = line.filter((x) => x.status === 'approved').length
  return { line, accepted, full: trip.maxGuests !== null && accepted >= trip.maxGuests }
}

/** Where a guest stands, in a few words. */
function standing(g: Guest, trip: OrganizerTrip, full: boolean): string {
  const payFirst = trip.joinMode !== 'accept_first'
  if (g.status === 'declined')
    return g.refundSentAt ? `Turned down · refunded ${day(g.refundSentAt)}` : 'Turned down'
  if (g.status === 'approved') {
    if (g.paymentConfirmedAt) return `Accepted · paid ${day(g.paymentConfirmedAt)}`
    if (g.paymentSentAt) return `Accepted · says they paid ${day(g.paymentSentAt)}`
    return 'Accepted · waiting on payment'
  }
  if (!g.signedAt) return 'Hasn’t signed'
  if (!payFirst) return `Signed ${day(g.signedAt)}${full ? ' · trip full' : ''}`
  if (g.paymentConfirmedAt)
    return `Payment confirmed ${day(g.paymentConfirmedAt)}${full ? ' · trip full: refund' : ''}`
  if (g.paymentSentAt) return `Says they paid ${day(g.paymentSentAt)}`
  return `Signed ${day(g.signedAt)} · waiting on payment`
}

/**
 * The one thing the organizer does next for a guest, if anything (owner's wording, 2026-10-24). Two kinds: a payment
 * the guest says they sent, to check and confirm, and a guest ready to accept onto the trip. The amount is the first
 * payment their agreement quoted; guests don't type what they sent.
 */
type Action =
  | { kind: 'payment'; text: string; button: string; update: GuestUpdate }
  | { kind: 'accept'; text: string; button: string; update: GuestUpdate }
  // Their payment arrived but every spot is taken: they're owed it back. The button opens Details, where turning
  // them down asks for "Refund sent".
  | { kind: 'refund'; text: string; button: string }

function actionFor(g: Guest, trip: OrganizerTrip, full: boolean): Action | null {
  if (g.status === 'declined' || !g.signedAt) return null
  const payFirst = trip.joinMode !== 'accept_first'
  const due = g.terms ? `${money(g.terms.firstInstallmentCents)} ` : ''
  if (g.paymentSentAt && !g.paymentConfirmedAt && (payFirst || g.status === 'approved'))
    return {
      kind: 'payment',
      text: `Says they paid ${due}on ${day(g.paymentSentAt)}`,
      button: 'Confirm payment',
      update: { paymentConfirmed: true },
    }
  if (g.status === 'interested' && full && g.paymentConfirmedAt && !g.refundSentAt)
    return {
      kind: 'refund',
      text: `Paid ${due.trim() || 'their payment'} but the trip is full`,
      button: 'Refund and turn down',
    }
  if (g.status !== 'interested' || full || (payFirst && !g.paymentConfirmedAt)) return null
  return {
    kind: 'accept',
    text: payFirst
      ? `Requested to join your trip on ${day(g.createdAt)} and paid the required ${due.trim() || 'payment'}`
      : `Requested to join your trip on ${day(g.createdAt)} and signed the trip agreement`,
    button: 'Accept trip guest',
    update: { status: 'approved' },
  }
}

/** One guest in Manage Guests: name, where they stand, when they joined, how much has arrived, and Details. */
function GuestRow({
  g,
  n,
  trip,
  full,
  onDetails,
}: {
  g: Guest
  n: number
  trip: OrganizerTrip
  full: boolean
  onDetails: () => void
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule py-3 first:border-t-0">
      <span className="w-5 font-semibold text-muted">{n}</span>
      <div className="min-w-0 flex-[1_1_140px]">
        <div className="font-semibold">
          {g.firstName} {g.lastName}
        </div>
        <div className="text-sm text-muted">
          {standing(g, trip, full)} · joined {day(g.createdAt)}
        </div>
        {g.terms && g.status !== 'declined' && <Paid terms={g.terms} />}
      </div>
      <div className="ml-auto flex gap-2">
        <button type="button" onClick={onDetails} className={outlined}>
          Details
        </button>
      </div>
    </li>
  )
}

/** One action: who, what happened, the filled button that does it, and Details. A payment carries a how-to tip. */
function ActionRow({
  g,
  action,
  onUpdate,
  onDetails,
}: {
  g: Guest
  action: Action
  onUpdate: Props['onUpdate']
  onDetails: () => void
}) {
  const [help, setHelp] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule py-3 first:border-t-0">
      <div className="min-w-0 flex-[1_1_200px]">
        <div className="font-semibold">
          {g.firstName} {g.lastName}
        </div>
        <div className="flex items-center gap-1 text-sm text-body">
          <span>{action.text}</span>
          {action.kind === 'payment' && (
            <button
              type="button"
              onClick={() => setHelp(!help)}
              aria-expanded={help}
              aria-label="What to check"
              className="-my-3 grid h-11 w-11 shrink-0 place-items-center text-royal"
            >
              <Info className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <div className="ml-auto flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (action.kind === 'refund') return onDetails()
            setBusy(true)
            try {
              await onUpdate(g, action.update)
            } finally {
              setBusy(false)
            }
          }}
          className={`${filled} disabled:opacity-60`}
        >
          {action.button}
        </button>
        <button type="button" onClick={onDetails} className={outlined}>
          Details
        </button>
      </div>
      {help && (
        <p className="w-full rounded-xl bg-royal-pale px-4 py-3 text-sm text-ink">
          Check Zelle, Cash App or wherever you take payments. If the money is there, confirm it.
        </p>
      )}
    </li>
  )
}

/** A section's icon in a royal-pale circle, as on the homepage's cards. */
export function IconCircle({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-royal-pale text-royal">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  )
}

/** How much of a guest's price has arrived, as a bar and in words. */
function Paid({ terms }: { terms: NonNullable<Guest['terms']> }) {
  const paid = terms.priceCents - terms.balanceCents
  const pct = terms.priceCents ? Math.round((paid / terms.priceCents) * 100) : 0
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Paid so far"
        className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-royal-pale"
      >
        <div className="h-full rounded-full bg-royal" style={{ width: `${pct}%` }} />
      </div>
      <span className="whitespace-nowrap text-sm text-body">
        {money(paid)} of {money(terms.priceCents)} paid
      </span>
    </div>
  )
}

/** A labelled contact detail with a button that copies it. */
function Contact({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // The browser refused (no permission or not a secure page): the value is still there to select.
    }
  }
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <dt className="font-semibold text-muted">{label}</dt>
        <dd className="break-all text-body">{value}</dd>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
        title={copied ? 'Copied' : 'Copy'}
        className="group -mr-2 grid h-11 w-11 shrink-0 place-items-center"
      >
        {/* Small to look at, 44 px to tap. */}
        <span className="grid h-8 w-8 place-items-center rounded-lg border border-royal text-royal group-hover:bg-royal-pale">
          {copied ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
      </button>
    </div>
  )
}

/** Everything about one guest and every change, in a dialog, so the list stays one line per guest. */
function GuestDetails({
  g,
  trip,
  rooms,
  full,
  onUpdate,
  onRead,
  onHistory,
  onClose,
  error,
}: Props & {
  g: Guest
  full: boolean
  onRead: (guest: Guest) => void
  onHistory: (guest: Guest) => void
  onClose: () => void
}) {
  const label = 'mb-1 block text-sm font-semibold text-muted'
  return (
    <Dialog title={`${g.firstName} ${g.lastName}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <dl className="flex flex-col gap-2 text-sm">
          <Contact label="Phone" value={g.phone} />
          <Contact label="Email" value={g.email} />
        </dl>
        {g.terms && g.status !== 'declined' && (
          <div>
            <span className={label}>Payments</span>
            <Paid terms={g.terms} />
            <span className="mt-1 block text-sm text-muted">
              {money(g.terms.balanceCents)} left to pay
            </span>
          </div>
        )}
        <div className="text-sm text-body">
          <div>Joined {day(g.createdAt)}</div>
          <button
            type="button"
            onClick={() => {
              onClose()
              onHistory(g)
            }}
            className={`${outlined} mt-2`}
          >
            History
          </button>
        </div>
        {rooms.length > 0 && (
          <div>
            <span className={label}>Room</span>
            <select
              className="min-h-[44px] w-full rounded-lg border border-rule bg-white px-2"
              value={g.roomId ?? ''}
              onChange={(e) => onUpdate(g, { roomId: e.target.value || null })}
              aria-label={`Room for ${g.firstName}`}
              disabled={g.status === 'declined'}
            >
              <option value="">No room yet</option>
              {rooms
                .filter((r) => r.id)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({trip.guests.filter((x) => x.roomId === r.id).length}/{r.capacity})
                  </option>
                ))}
            </select>
            {g.roomNote && (
              <span className="mt-1 block text-sm text-muted">Share with: {g.roomNote}</span>
            )}
          </div>
        )}
        <div>
          <span className={label}>Trip agreement</span>
          {g.signedAt ? (
            <button
              type="button"
              onClick={() => {
                onClose()
                onRead(g)
              }}
              className={outlined}
            >
              Read what they signed ({day(g.signedAt)})
            </button>
          ) : (
            <span className="text-sm">Not signed</span>
          )}
        </div>
        <div className="text-sm">
          <span className={label}>Payment</span>
          {g.paymentConfirmedAt ? (
            <span className="flex flex-col items-start gap-1">
              <span>Confirmed {day(g.paymentConfirmedAt)}</span>
              {(g.status === 'interested' ||
                (g.status === 'approved' && trip.joinMode === 'accept_first')) && (
                <UndoConfirm onUndo={() => onUpdate(g, { paymentConfirmed: false })} />
              )}
            </span>
          ) : g.status === 'declined' ? (
            '—'
          ) : trip.joinMode === 'accept_first' && g.status !== 'approved' ? (
            <span>They see how to pay you once you accept them.</span>
          ) : (
            <span className="flex flex-col items-start gap-1">
              <span>
                {g.paymentSentAt ? `Says they paid ${day(g.paymentSentAt)}` : 'Not paid yet'}
              </span>
              <button
                type="button"
                onClick={() => onUpdate(g, { paymentConfirmed: true })}
                className={outlined}
              >
                Confirm received
              </button>
            </span>
          )}
        </div>
        <div>
          <span className={label}>Spot</span>
          <Spot
            key={g.status}
            guest={g}
            full={full}
            payFirst={trip.joinMode !== 'accept_first'}
            onUpdate={onUpdate}
          />
        </div>
      </div>
    </Dialog>
  )
}

const at = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

/**
 * One history line in plain words. A payment line names the first payment their agreement asked for: guests tap
 * "I've paid" and don't type an amount.
 */
export function eventText(e: GuestEvent, g: Guest): string {
  const first = g.terms ? ` the ${money(g.terms.firstInstallmentCents)} first payment` : ''
  switch (e.kind) {
    case 'joined':
      return 'Joined the trip'
    case 'signed':
      return 'Signed the trip agreement'
    case 'said_paid':
      return `Said they paid${first}`
    case 'payment_confirmed':
      return g.terms ? `Confirmed${first} arrived` : 'Payment confirmed'
    case 'payment_undone':
      return g.terms ? `Undid the confirmation of${first}` : 'Payment confirmation undone'
    case 'accepted':
      return 'Accepted onto the trip'
    case 'turned_down':
      return 'Turned down'
    case 'put_back':
      return 'Put back to waiting'
    case 'refund_sent':
      return 'Refund marked as sent'
    case 'refund_undone':
      return 'Refund mark taken off'
    case 'room_changed':
      return e.toRoom
        ? e.fromRoom
          ? `Room changed from ${e.fromRoom} to ${e.toRoom}`
          : `Room set to ${e.toRoom}`
        : 'Room cleared'
    case 'contact_changed':
      return `Contact details changed: ${e.fields.join(', ')}`
  }
}

/** Everything that happened to a guest, oldest first, and who did it. */
function GuestHistory({
  tripId,
  guest,
  onClose,
}: {
  tripId: string
  guest: Guest
  onClose: () => void
}) {
  const [events, setEvents] = useState<GuestEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api
      .getGuestHistory(tripId, guest.id)
      .then(setEvents)
      .catch(() => setError('The history could not be loaded.'))
  }, [tripId, guest.id])
  const by = (e: GuestEvent) =>
    e.actor === 'guest' ? guest.firstName : e.actor === 'organizer' ? 'An organizer' : 'CrewControl'
  return (
    <Dialog title={`${guest.firstName}’s history`} onClose={onClose}>
      {error && (
        <p role="alert" className="font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      {events && events.length === 0 && <p className="text-body">Nothing recorded yet.</p>}
      {events && events.length > 0 && (
        <ol className="flex flex-col">
          {events.map((e, i) => (
            <li key={i} className="border-t border-rule py-2.5 first:border-t-0">
              <div className="font-semibold">{eventText(e, guest)}</div>
              <div className="text-sm text-muted">
                {at(e.at)} · {by(e)}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  )
}

/** Everyone who joined, in line order, one line each. Next steps are in Actions, so these lines have none. */
export function GuestsCard({ trip, rooms, onUpdate, error }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const [reading, setReading] = useState<Guest | null>(null)
  const [history, setHistory] = useState<Guest | null>(null)
  const { line, accepted, full } = lineOf(trip)
  const max = trip.maxGuests
  const g = line.find((x) => x.id === open)
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-card sm:p-6">
      <h2 className="flex items-center gap-3 text-xl font-extrabold">
        <IconCircle icon={Users} />
        Manage Guests
      </h2>
      <p className="text-body">
        {trip.joinMode === 'first_come'
          ? 'First come, first served: confirming a payment gives that guest the next spot.'
          : trip.joinMode === 'pay_first'
            ? 'Accept each guest once they’ve signed and their payment arrived.'
            : 'Accept each guest once they’ve signed. Then they see how to pay you.'}{' '}
        {max ? `${accepted} of ${max} spots taken.` : `${accepted} accepted. No limit set.`}
      </p>
      {line.length === 0 ? (
        <p className="rounded-xl bg-ground p-4 text-body">No one has signed up yet.</p>
      ) : (
        <ul>
          {line.map((x, i) => (
            <GuestRow
              key={x.id}
              g={x}
              n={i + 1}
              trip={trip}
              full={full}
              onDetails={() => setOpen(x.id)}
            />
          ))}
        </ul>
      )}
      {g && (
        <GuestDetails
          g={g}
          trip={trip}
          rooms={rooms}
          full={full}
          onUpdate={onUpdate}
          error={error}
          onRead={setReading}
          onHistory={setHistory}
          onClose={() => setOpen(null)}
        />
      )}
      {reading && <SignedCopy tripId={trip.id} guest={reading} onClose={() => setReading(null)} />}
      {history && (
        <GuestHistory tripId={trip.id} guest={history} onClose={() => setHistory(null)} />
      )}
    </section>
  )
}

/**
 * What needs doing on the trip, counted in a red badge. Its own section, above Manage Guests, because other trip actions
 * (reminders, payments due) will join it.
 */
export function ActionsCard({ trip, rooms, onUpdate, error }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const [reading, setReading] = useState<Guest | null>(null)
  const [history, setHistory] = useState<Guest | null>(null)
  const { line, full } = lineOf(trip)
  const todo = line.flatMap((x) => {
    const action = actionFor(x, trip, full)
    return action ? [{ g: x, action }] : []
  })
  const g = line.find((x) => x.id === open)
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-white p-5 shadow-card sm:p-6">
      <h2 className="flex items-center gap-3 text-xl font-extrabold">
        <IconCircle icon={ListChecks} />
        Actions
        {todo.length > 0 && (
          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-[#B42318] px-1.5 text-sm font-bold text-white">
            {todo.length}
            <span className="sr-only"> to do</span>
          </span>
        )}
      </h2>
      {todo.length === 0 ? (
        <p className="text-body">Nothing needs you right now.</p>
      ) : (
        <ul>
          {todo.map(({ g: x, action }) => (
            <ActionRow
              key={x.id}
              g={x}
              action={action}
              onUpdate={onUpdate}
              onDetails={() => setOpen(x.id)}
            />
          ))}
        </ul>
      )}
      {g && (
        <GuestDetails
          g={g}
          trip={trip}
          rooms={rooms}
          full={full}
          onUpdate={onUpdate}
          error={error}
          onRead={setReading}
          onHistory={setHistory}
          onClose={() => setOpen(null)}
        />
      )}
      {reading && <SignedCopy tripId={trip.id} guest={reading} onClose={() => setReading(null)} />}
      {history && (
        <GuestHistory tripId={trip.id} guest={history} onClose={() => setHistory(null)} />
      )}
    </section>
  )
}
