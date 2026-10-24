import type { PublicRoom } from '@cc/types'
import { RoomArt, sharingLine } from './RoomArt'

/** A room as a card with a picture of its beds, who shares, and what happens with fewer people. */
export function RoomCard({
  room,
  checked,
  onChange,
}: {
  room: PublicRoom
  checked: boolean
  onChange: () => void
}) {
  const full = room.spotsLeft === 0
  return (
    <label
      className={`flex flex-col gap-2 rounded-xl border-2 p-3 text-sm ${
        full
          ? 'cursor-not-allowed border-rule opacity-50'
          : checked
            ? 'cursor-pointer border-royal bg-royal-pale'
            : 'cursor-pointer border-rule bg-white'
      }`}
    >
      <RoomArt beds={room.bedTypes} className="h-16 w-full" />
      <span className="flex items-start gap-2.5">
        <input
          type="radio"
          name="room"
          checked={checked}
          onChange={onChange}
          disabled={full}
          className="mt-1 h-4 w-4 accent-royal"
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold text-ink">{room.name}</span>
          <span className="text-muted">{sharingLine(room)}</span>
          <span className="font-semibold text-royal">
            {full
              ? 'Full'
              : `${room.spotsLeft} of ${room.capacity} ${room.capacity === 1 ? 'place' : 'places'} left`}
          </span>
        </span>
      </span>
    </label>
  )
}
