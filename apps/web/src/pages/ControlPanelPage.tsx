import type { Guest, GuestUpdate, OrganizerTrip, TripRoom } from '@cc/types'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AccountMenu } from '@/components/AccountMenu'
import { Card } from '@/components/EditorParts'
import { Logo } from '@/components/Logo'
import { api } from '@/lib/api'
import { signupOrder } from '@/lib/signups'

// The organizer's Trip Control panel: the sign-up line. The trip's rooms, price and payment schedule are set in the
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

        <SignupLine trip={trip} rooms={rooms} onUpdate={updateGuest} error={guestError} />
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

/** Everyone who registered, in line order, with the spot cutoff where the trip has a limit. */
function SignupLine({
  trip,
  rooms,
  onUpdate,
  error,
}: {
  trip: OrganizerTrip
  rooms: TripRoom[]
  onUpdate: (guest: Guest, update: GuestUpdate) => void
  error: string | null
}) {
  const line = signupOrder(trip.guests)
  const confirmed = line.filter((g) => g.paymentConfirmedAt).length
  const max = trip.maxGuests
  return (
    <Card title="Sign-ups">
      <p className="text-body">
        {trip.payFirst
          ? 'Pay to register is on. Confirm each payment when it arrives: spots go in that order.'
          : 'Guests register for free; approve who comes.'}{' '}
        {max
          ? `${confirmed} of ${max} spots confirmed.`
          : `${confirmed} payments confirmed. No limit set.`}
      </p>
      {error && (
        <p role="alert" className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
          {error}
        </p>
      )}
      {line.length === 0 ? (
        <p className="rounded-xl bg-ground p-4 text-body">No one has signed up yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="text-sm text-muted">
              <tr>
                <th className="py-2 font-semibold">#</th>
                <th className="py-2 font-semibold">Guest</th>
                {rooms.length > 0 && <th className="py-2 font-semibold">Room</th>}
                <th className="py-2 font-semibold">Says they paid</th>
                <th className="py-2 font-semibold">Payment arrived</th>
                <th className="py-2 font-semibold">Spot</th>
                <th className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {line.map((g, i) => {
                const overLimit = Boolean(max && g.paymentConfirmedAt && i >= max)
                return (
                  <tr key={g.id} className="border-t border-rule align-top">
                    <td className="py-3 font-semibold">{i + 1}</td>
                    <td className="py-3">
                      <span className="font-semibold">
                        {g.firstName} {g.lastName}
                      </span>
                      <span className="block text-sm text-muted">
                        {g.phone} · {g.email}
                      </span>
                      <span className="block text-sm text-muted">
                        Signed up {when(g.createdAt)}
                      </span>
                    </td>
                    {rooms.length > 0 && (
                      <td className="py-3 text-sm">
                        <select
                          className="min-h-[44px] max-w-[180px] rounded-lg border border-rule bg-white px-2"
                          value={g.roomId ?? ''}
                          onChange={(e) => onUpdate(g, { roomId: e.target.value || null })}
                          aria-label={`Room for ${g.firstName}`}
                        >
                          <option value="">No room yet</option>
                          {rooms
                            .filter((r) => r.id)
                            .map((r) => {
                              const taken = trip.guests.filter((x) => x.roomId === r.id).length
                              return (
                                <option key={r.id} value={r.id}>
                                  {r.name} ({taken}/{r.capacity})
                                </option>
                              )
                            })}
                        </select>
                        {g.roomNote && (
                          <span className="mt-1 block text-muted">Share with: {g.roomNote}</span>
                        )}
                      </td>
                    )}
                    <td className="py-3 text-sm">
                      {g.paymentSentAt ? when(g.paymentSentAt) : '—'}
                    </td>
                    <td className="py-3">
                      {g.paymentConfirmedAt ? (
                        <span className="flex flex-col items-start gap-1 text-sm">
                          <span className="font-semibold text-royal">
                            {when(g.paymentConfirmedAt)}
                          </span>
                          <UndoConfirm onUndo={() => onUpdate(g, { paymentConfirmed: false })} />
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onUpdate(g, { paymentConfirmed: true })}
                          className="inline-flex min-h-[44px] items-center rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale"
                        >
                          Confirm received
                        </button>
                      )}
                    </td>
                    <td className="py-3 text-sm">
                      {!g.paymentConfirmedAt
                        ? 'Waiting on payment'
                        : overLimit
                          ? 'Trip full: refund'
                          : 'Has a spot'}
                    </td>
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdate(g, {
                            status: g.status === 'approved' ? 'interested' : 'approved',
                          })
                        }
                        className={`inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-semibold ${
                          g.status === 'approved'
                            ? 'bg-royal text-white hover:bg-royal-dark'
                            : 'border border-royal text-royal hover:bg-royal-pale'
                        }`}
                      >
                        {g.status === 'approved' ? 'Approved' : 'Approve'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

/**
 * Undoing a confirmed payment loses the guest's place in line (confirming again stamps a new time), so it takes a
 * second tap that says so.
 */
function UndoConfirm({ onUndo }: { onUndo: () => void }) {
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
