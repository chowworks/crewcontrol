import type { PublicRoom } from '@cc/types'
import { money } from '@/lib/format'
import { RoomArt, sharingLine } from './RoomArt'

/** A room as a card with a picture of its beds, who shares, and what happens with fewer people. */
export function RoomCard({
  room,
  checked,
  onChange,
  price,
  guests,
  wholeRoom,
}: {
  room: PublicRoom
  /** Left out on the trip page, where the room is only shown, not picked. */
  checked?: boolean
  onChange?: () => void
  /** Its price per person, shown when the trip's rooms are priced differently (issue #30). */
  price?: number
  /** Accepted guests already in it, on the join page only (never the public trip page). */
  guests?: string[]
  /** "Room to myself", under the picked room when the organizer priced it and every place is free. */
  wholeRoom?: { checked: boolean; behalf: boolean; onChange: (on: boolean) => void }
}) {
  const full = room.spotsLeft === 0
  // On the trip page the card only shows the room; on the join page it's a choice.
  // With the upgrade showing, the room and the upgrade are each their own label.
  const Tag = onChange && !wholeRoom ? 'label' : 'div'
  const Pick = wholeRoom ? 'label' : 'span'
  return (
    <Tag
      className={`flex flex-col gap-2 rounded-xl border-2 p-3 text-sm ${
        !onChange
          ? `border-rule bg-white ${full ? 'opacity-50' : ''}`
          : full
            ? 'cursor-not-allowed border-rule opacity-50'
            : checked
              ? 'cursor-pointer border-royal bg-royal-pale'
              : 'cursor-pointer border-rule bg-white'
      }`}
    >
      <RoomArt beds={room.bedTypes} className="h-16 w-full" />
      <Pick className="flex items-start gap-2.5">
        {onChange && (
          <input
            type="radio"
            name="room"
            checked={checked}
            onChange={onChange}
            disabled={full}
            className="mt-1 h-4 w-4 accent-royal"
          />
        )}
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold text-ink">
            {room.name}
            {price !== undefined && <> · {money(price)} per person</>}
          </span>
          <span className="text-muted">{sharingLine(room)}</span>
          {guests && guests.length > 0 && (
            <span className="text-ink">With {guests.join(', ')}</span>
          )}
          <span className="font-semibold text-royal">
            {full
              ? 'Full'
              : `${room.spotsLeft} of ${room.capacity} ${room.capacity === 1 ? 'place' : 'places'} left`}
          </span>
        </span>
      </Pick>
      {wholeRoom && room.wholeRoom && (
        <label className="flex flex-col gap-1 border-t border-royal/20 pt-2">
          <span className="flex min-h-[44px] items-center gap-2.5">
            <input
              type="checkbox"
              checked={wholeRoom.checked}
              onChange={(e) => wholeRoom.onChange(e.target.checked)}
              className="h-5 w-5 accent-royal"
            />
            <strong>
              Upgrade: room to {wholeRoom.behalf ? 'themselves' : 'myself'} · +
              {money(room.wholeRoom.extraCents)}
            </strong>
          </span>
          <span className="pl-[30px] text-ink">
            Nobody else is put in this room. {wholeRoom.behalf ? 'They pay' : 'You pay'}{' '}
            <strong>{money(room.priceCents + room.wholeRoom.extraCents)}</strong> instead of{' '}
            {money(room.priceCents)}, spread across the payments.
          </span>
        </label>
      )}
    </Tag>
  )
}
