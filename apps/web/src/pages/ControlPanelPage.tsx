import type { Guest, GuestUpdate, OrganizerTrip, SignedAgreement, TripRoom } from '@cc/types'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AccountMenu } from '@/components/AccountMenu'
import { Dialog } from '@/components/Dialog'
import { Logo } from '@/components/Logo'
import { api } from '@/lib/api'
import { money } from '@/lib/format'
import { ActionsCard, GuestsCard } from './TripGuests'
import { TripLogCard } from './TripLog'

// The organizer's Trip Control panel: what needs doing on the trip (Actions), then its guests in line order. The trip's rooms, price and payment schedule are set in the
// trip editor (steps 3 and 4).

export function ControlPanelPage() {
  const { id = '' } = useParams()
  const [trip, setTrip] = useState<OrganizerTrip | null>(null)
  const [rooms, setRooms] = useState<TripRoom[]>([])
  const [guestError, setGuestError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.getTrip(id), api.getRooms(id)])
      .then(([t, r]) => {
        setTrip(t)
        setRooms(r)
      })
      .catch(() => setError('This trip could not be loaded.'))
  }, [id])

  async function updateGuest(guest: Guest, update: GuestUpdate) {
    setGuestError(null)
    try {
      setTrip(await api.updateGuest(id, guest.id, update))
    } catch (err) {
      setGuestError(err instanceof Error ? err.message : 'That change did not save.')
    }
  }

  if (error) return <p className="p-8 text-body">{error}</p>
  if (!trip) return <div className="min-h-screen bg-ground" aria-busy="true" />

  return (
    <div className="min-h-screen bg-ground pb-16 text-ink">
      <header className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-3 px-5 py-4">
        <Logo />
        <div className="flex items-center gap-3">
          <Link
            to={`/organize/${id}`}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-royal px-4 font-semibold text-royal hover:bg-royal-pale"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Edit trip
          </Link>
          <AccountMenu />
        </div>
      </header>

      <main className="mx-auto flex max-w-[960px] flex-col gap-6 px-5">
        <div>
          <p className="text-sm font-semibold text-muted">Trip Control panel</p>
          <h1 className="text-3xl font-extrabold">{trip.name}</h1>
        </div>

        {guestError && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {guestError}
          </p>
        )}
        <ActionsCard trip={trip} rooms={rooms} onUpdate={updateGuest} error={guestError} />
        <GuestsCard trip={trip} rooms={rooms} onUpdate={updateGuest} error={guestError} />
        <TripLogCard trip={trip} />
      </main>
    </div>
  )
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

const smallOutlined =
  'inline-flex min-h-[44px] items-center rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale'

/** A guest's spot: accept, put back, turn down (a paid guest needs "Refund sent" ticked), or undo. */
export function Spot({
  guest: g,
  full,
  payFirst,
  onUpdate,
}: {
  guest: Guest
  full: boolean
  payFirst: boolean
  onUpdate: (guest: Guest, update: GuestUpdate) => void
}) {
  if (g.status === 'declined')
    return (
      <span className="flex flex-col items-start gap-1 text-sm">
        <span className="font-semibold">Turned down</span>
        {g.refundSentAt && <span className="text-muted">Refund sent {when(g.refundSentAt)}</span>}
        <button
          type="button"
          onClick={() => onUpdate(g, { status: 'interested' })}
          className={smallOutlined}
        >
          Undo
        </button>
      </span>
    )
  if (g.status === 'approved')
    return (
      <span className="flex flex-col items-start gap-1 text-sm">
        <span className="font-semibold text-royal">Accepted</span>
        <PutBack onPutBack={() => onUpdate(g, { status: 'interested' })} />
        <TurnDown guest={g} onUpdate={onUpdate} />
      </span>
    )
  // A spot opens to any guest who signed and, where guests pay first, whose payment arrived: on a first come trip
  // that is someone put back to waiting, or waiting when a spot freed up.
  const waiting = !g.signedAt
    ? 'Not signed'
    : payFirst && !g.paymentConfirmedAt
      ? 'Waiting on payment'
      : full
        ? g.paymentConfirmedAt
          ? 'Trip full: refund them'
          : 'Trip full'
        : null
  return (
    <span className="flex flex-col items-start gap-1 text-sm">
      {g.refundSentAt && <span className="text-muted">Refund sent {when(g.refundSentAt)}</span>}
      {waiting ? (
        <span>{waiting}</span>
      ) : (
        <button
          type="button"
          onClick={() => onUpdate(g, { status: 'approved' })}
          className={smallOutlined}
        >
          Accept
        </button>
      )}
      <TurnDown guest={g} onUpdate={onUpdate} />
    </span>
  )
}

/** Taking an accepted guest's spot away takes a second tap. */
function PutBack({ onPutBack }: { onPutBack: () => void }) {
  const [asking, setAsking] = useState(false)
  if (!asking)
    return (
      <button type="button" onClick={() => setAsking(true)} className={smallOutlined}>
        Put back
      </button>
    )
  return (
    <span className="flex flex-col gap-1">
      <span>They lose their spot and go back to waiting.</span>
      <span className="flex gap-2">
        <button type="button" onClick={onPutBack} className={smallOutlined}>
          Put back
        </button>
        <button type="button" onClick={() => setAsking(false)} className={smallOutlined}>
          Keep
        </button>
      </span>
    </span>
  )
}

/**
 * Turning a guest down takes a second tap. A guest whose payment arrived is owed a full refund, so the organizer
 * ticks "Refund sent" first (owner's decision, 2026-10-21). CrewControl records it and moves no money.
 */
function TurnDown({
  guest: g,
  onUpdate,
}: {
  guest: Guest
  onUpdate: (guest: Guest, update: GuestUpdate) => void
}) {
  const [asking, setAsking] = useState(false)
  const [refunded, setRefunded] = useState(false)
  const paid = Boolean(g.paymentConfirmedAt)
  if (!asking)
    return (
      <button type="button" onClick={() => setAsking(true)} className={smallOutlined}>
        Turn down
      </button>
    )
  return (
    <span className="flex max-w-[220px] flex-col gap-1.5">
      {paid ? (
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={refunded}
            onChange={(e) => setRefunded(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-royal"
          />
          <span>
            Refund sent. {g.firstName} paid, so they get everything back
            {g.terms ? ` (${money(g.terms.firstInstallmentCents)} so far)` : ''}.
          </span>
        </label>
      ) : g.paymentSentAt ? (
        <span>
          {g.firstName} says they paid. If it arrived, confirm it first so the refund is recorded.
          Turn them down?
        </span>
      ) : (
        <span>Turn {g.firstName} down?</span>
      )}
      <span className="flex gap-2">
        <button
          type="button"
          disabled={paid && !refunded}
          onClick={() => onUpdate(g, { status: 'declined', ...(paid ? { refundSent: true } : {}) })}
          className={`${smallOutlined} disabled:opacity-50`}
        >
          Turn down
        </button>
        <button type="button" onClick={() => setAsking(false)} className={smallOutlined}>
          Keep
        </button>
      </span>
    </span>
  )
}

/** The agreement a guest signed, exactly as they saw it, with when and from where. */
export function SignedCopy({
  tripId,
  guest,
  onClose,
}: {
  tripId: string
  guest: Guest
  onClose: () => void
}) {
  const [copy, setCopy] = useState<SignedAgreement | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api
      .getGuestAgreement(tripId, guest.id)
      .then(setCopy)
      .catch(() => setError('The signed copy could not be loaded.'))
  }, [tripId, guest.id])
  return (
    <Dialog title={`${guest.firstName}’s signed agreement`} onClose={onClose}>
      {error && (
        <p role="alert" className="font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      {copy && (
        <div className="flex flex-col gap-3">
          <div className="whitespace-pre-line rounded-xl bg-ground p-4 text-[15px] text-body">
            {copy.text}
          </div>
          <div className="grid gap-1 text-sm text-muted">
            <div>
              Signed &ldquo;{copy.typedName}&rdquo; on {when(copy.signedAt)}
            </div>
            <div>From {copy.ipAddress || 'an unknown address'}</div>
            <div className="break-all">{copy.userAgent || 'Unknown browser'}</div>
            <div className="break-all">Fingerprint (SHA-256): {copy.textHash}</div>
          </div>
        </div>
      )}
    </Dialog>
  )
}

/**
 * Undoing a confirmed payment loses the guest's place in line (confirming again stamps a new time), so it takes a
 * second tap that says so.
 */
export function UndoConfirm({ onUndo }: { onUndo: () => void }) {
  const [asking, setAsking] = useState(false)
  if (!asking)
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="inline-flex min-h-[44px] items-center rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale"
      >
        Undo
      </button>
    )
  return (
    <span className="flex flex-col gap-1">
      <span className="text-[#B42318]">They lose their place in line.</span>
      <span className="flex gap-2">
        <button
          type="button"
          onClick={onUndo}
          className="inline-flex min-h-[44px] items-center rounded-lg bg-royal px-3 text-sm font-semibold text-white hover:bg-royal-dark"
        >
          Undo payment
        </button>
        <button
          type="button"
          onClick={() => setAsking(false)}
          className="inline-flex min-h-[44px] items-center rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale"
        >
          Keep
        </button>
      </span>
    </span>
  )
}
