import { roomsPricedApart, type JoinView } from '@cc/types'
import { useState } from 'react'
import { Dialog } from '@/components/Dialog'
import { RoomPick } from '@/components/RoomPick'
import { useToast } from '@/components/Toast'
import { ApiError, api } from '@/lib/api'

const filled =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-dark disabled:opacity-60'
const outlined =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-royal px-4 text-sm font-semibold text-royal hover:bg-royal-pale'

/**
 * An organizer going on their own trip picks or changes their room from the trip page's Rooms (owner's decision,
 * 2026-11-28). Guests ask for a change instead; the organizer is the one who'd make it.
 */
export function OrganizerRoom({
  view,
  onSaved,
}: {
  view: JoinView & { me: NonNullable<JoinView['me']> }
  onSaved: () => void
}) {
  const { trip, me } = view
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [roomId, setRoomId] = useState(me.roomId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const room = trip.rooms.find((r) => r.id === me.roomId)

  async function save() {
    if (!me.organizerTripId || busy) return
    setBusy(true)
    setError(null)
    try {
      await api.updateGuest(me.organizerTripId, me.id, { roomId: roomId || null })
      const picked = trip.rooms.find((r) => r.id === roomId)
      toast({ text: picked ? `You’re in ${picked.name}.` : 'You’re out of your room for now.' })
      setOpen(false)
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Your room could not be saved. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-2.5">
      <p className="text-sm text-body">
        {room ? (
          <>
            Your room: <strong className="text-ink">{room.name}</strong>
          </>
        ) : (
          'You haven’t picked your room yet.'
        )}
      </p>
      <button
        type="button"
        onClick={() => {
          setRoomId(me.roomId ?? '')
          setError(null)
          setOpen(true)
        }}
        className={room ? outlined : filled}
      >
        {room ? 'Change room' : 'Pick your room'}
      </button>
      {open && (
        <Dialog title={room ? 'Change your room' : 'Pick your room'} onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-4">
            {error && (
              <p role="alert" className="font-semibold text-[#B42318]">
                {error}
              </p>
            )}
            <RoomPick
              legend="Which room are you taking?"
              rooms={trip.rooms}
              value={roomId}
              onChange={setRoomId}
              priced={roomsPricedApart(trip.rooms, trip.costPerPersonCents)}
              guests={view.roomGuests}
              later={{ title: 'No room for now', line: 'Your place on the trip stays yours.' }}
            />
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={save}
                disabled={busy || roomId === (me.roomId ?? '')}
                className={filled}
              >
                Save
              </button>
              <button type="button" onClick={() => setOpen(false)} className={outlined}>
                Cancel
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
