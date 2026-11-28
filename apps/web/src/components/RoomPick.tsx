import type { PublicRoom } from '@cc/types'
import { RoomCard } from './RoomCard'

/**
 * Picking a room by its picture, as guests do on the join page, with a way to leave it for later. For an organizer going
 * on their own trip (owner's decision, 2026-11-28): in "I'm going too" and on their trip page.
 */
export function RoomPick({
  legend,
  rooms,
  value,
  onChange,
  priced,
  guests,
  later,
}: {
  legend: string
  rooms: PublicRoom[]
  /** The room picked, or '' for none yet. */
  value: string
  onChange: (roomId: string) => void
  /** Show each room's price: the trip's rooms are priced differently. */
  priced: boolean
  /** Who is in each room already, when known. */
  guests?: { roomId: string; names: string[] }[]
  /** The choice for no room yet: its title and line. */
  later: { title: string; line: string }
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-semibold">{legend}</legend>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {rooms.map((r) => (
          <RoomCard
            key={r.id}
            room={r}
            checked={value === r.id}
            price={priced ? r.priceCents : undefined}
            guests={guests?.find((g) => g.roomId === r.id)?.names}
            onChange={() => onChange(r.id)}
          />
        ))}
        <label
          className={`flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border-2 p-3 text-sm ${
            value === '' ? 'border-royal bg-royal-pale' : 'border-rule bg-white'
          }`}
        >
          <input
            type="radio"
            name="room"
            checked={value === ''}
            onChange={() => onChange('')}
            className="h-4 w-4 accent-royal"
          />
          <span>
            <span className="block font-semibold text-ink">{later.title}</span>
            <span className="text-muted">{later.line}</span>
          </span>
        </label>
      </div>
    </fieldset>
  )
}
