import { BED_LABELS, BED_TYPES, type TripRoom } from '@cc/types'
import { Plus, Trash2 } from 'lucide-react'
import { RoomArt, sharingLine } from '@/components/RoomArt'
import { Card, Field, field } from '@/components/EditorParts'

/**
 * A trip's rooms (step 3 of the trip editor), saved with the rest of the trip when the step changes. Each room's
 * weight and "Priced for" feed the price simulator in step 4.
 */
export function RoomsEditor({
  rooms,
  setRooms,
}: {
  rooms: TripRoom[]
  setRooms: (update: (rooms: TripRoom[]) => TripRoom[]) => void
}) {
  // Every problem with the rooms, by row, shown beside the room before the step is saved.
  const roomProblems = rooms.map((r) => roomProblem(r))

  const setRoom = (i: number, patch: Partial<TripRoom>) =>
    setRooms((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <Card title="Rooms">
      <p className="text-body">
        Each room&apos;s weight sets its share of the price: 1 is the baseline, 1.5 pays half again
        as much. &ldquo;Priced for&rdquo; is the fewest people the room is sold to: fewer than that
        and they pay for the empty places too. Guests see the beds as a picture.
      </p>
      <div className="flex flex-col gap-3">
        {rooms.map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-2 gap-2 rounded-xl border border-rule p-3 sm:grid-cols-[2fr_2fr_1fr_1fr_1fr_auto] sm:items-end"
          >
            <Field label="Room">
              <input
                className={field}
                value={r.name}
                onChange={(e) => setRoom(i, { name: e.target.value })}
              />
            </Field>
            <Field label="Beds">
              <input
                className={field}
                value={r.beds}
                onChange={(e) => setRoom(i, { beds: e.target.value })}
              />
            </Field>
            <Field label="Sleeps">
              <input
                className={field}
                type="number"
                min={1}
                max={20}
                value={r.capacity}
                onChange={(e) => setRoom(i, { capacity: Number(e.target.value) })}
              />
            </Field>
            <Field label="Weight">
              <input
                className={field}
                type="number"
                min={0.1}
                max={10}
                step={0.05}
                value={r.weight}
                onChange={(e) => setRoom(i, { weight: Number(e.target.value) })}
              />
            </Field>
            <Field label="Priced for">
              <input
                className={field}
                type="number"
                min={1}
                max={r.capacity}
                value={r.minPeople}
                onChange={(e) => setRoom(i, { minPeople: Number(e.target.value) })}
              />
            </Field>
            <button
              type="button"
              onClick={() => setRooms((rs) => rs.filter((_, j) => j !== i))}
              aria-label={`Remove ${r.name || 'room'}`}
              className="justify-self-start rounded-lg p-2.5 text-muted hover:bg-ground hover:text-ink"
            >
              <Trash2 className="h-5 w-5" aria-hidden="true" />
            </button>
            {roomProblems[i] && (
              <p role="alert" className="col-span-full font-semibold text-[#B42318]">
                {roomProblems[i]}
              </p>
            )}
            <div className="col-span-full flex flex-wrap items-center gap-3">
              <RoomArt beds={r.bedTypes} className="h-16 w-auto max-w-full" />
              <div className="flex flex-col gap-1.5">
                <span className="flex flex-wrap gap-1.5">
                  {BED_TYPES.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setRoom(i, { bedTypes: [...r.bedTypes, b] })}
                      disabled={r.bedTypes.length >= 8}
                      className="min-h-[44px] rounded-full border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale disabled:opacity-40"
                    >
                      + {BED_LABELS[b].label}
                    </button>
                  ))}
                  {r.bedTypes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setRoom(i, { bedTypes: r.bedTypes.slice(0, -1) })}
                      className="min-h-[44px] rounded-full border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale"
                    >
                      Remove last bed
                    </button>
                  )}
                </span>
                <span className="text-sm text-muted">{sharingLine(r)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() =>
            setRooms((rs) => [
              ...rs,
              { name: '', beds: '', capacity: 2, weight: 1, bedTypes: [], minPeople: 1 },
            ])
          }
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-royal px-4 font-semibold text-royal hover:bg-royal-pale"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add room
        </button>
      </div>
    </Card>
  )
}

/** What's wrong with one room, in a line, or null. */
export function roomProblem(r: TripRoom): string | null {
  if (!r.name.trim()) return 'Give this room a name.'
  if (!(r.capacity >= 1)) return 'A room sleeps at least 1.'
  if (!(r.weight > 0)) return 'Weight must be above 0 (1 is the baseline).'
  if (!(r.minPeople >= 1)) return '“Priced for” is at least 1.'
  if (r.minPeople > r.capacity) return '“Priced for” can’t be more than the room sleeps.'
  return null
}
