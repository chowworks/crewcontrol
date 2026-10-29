import { BED_LABELS, BED_TYPES, type RoomPricing, type TripRoom } from '@cc/types'
import { Plus, Trash2 } from 'lucide-react'
import { RoomArt, sharingLine } from '@/components/RoomArt'
import { Card, Field, field, Money } from '@/components/EditorParts'

/**
 * A trip's rooms (step 3 of the trip editor), saved with the rest of the trip when the step changes. Rooms either share
 * the trip's cost (a house: each room's weight sets its share in step 4's simulator) or each has its own price per
 * person (a resort: owner's decision, 2026-10-29), which is what a guest who picks it signs.
 */
export function RoomsEditor({
  rooms,
  setRooms,
  tripPriceCents,
  pricing,
  onPricing,
  guestsPick,
}: {
  rooms: TripRoom[]
  setRooms: (update: (rooms: TripRoom[]) => TripRoom[]) => void
  /** A room switched to its own price starts at the trip's. */
  tripPriceCents: number
  /** The same price for every room, typed per room here, or the cost split by weight in step 4. */
  pricing: RoomPricing
  onPricing: (pricing: RoomPricing) => void
  /** Guests pick their room (step 3's switch). Off: everyone gets the trip's one price, so rooms have none of their own. */
  guestsPick: boolean
}) {
  const ownPrices = pricing !== 'same'
  const typed = pricing === 'typed'
  // Every problem with the rooms, by row, shown beside the room before the step is saved.
  const roomProblems = rooms.map((r) =>
    roomProblem(r, typed ? 'typed' : ownPrices ? 'weights' : 'same')
  )

  const setRoom = (i: number, patch: Partial<TripRoom>) =>
    setRooms((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <Card title={guestsPick ? 'Rooms' : 'Rooms you’ll place guests in'}>
      {guestsPick ? (
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0 accent-royal"
            checked={ownPrices}
            onChange={(e) => {
              onPricing(e.target.checked ? 'typed' : 'same')
              // Back to one price: the rooms drop theirs. To typed prices: each starts at the trip's.
              setRooms((rs) =>
                rs.map((r) => ({
                  ...r,
                  priceCents: e.target.checked ? (r.priceCents ?? (tripPriceCents || null)) : null,
                }))
              )
            }}
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold">Each room has its own price</span>
            <span className="text-sm text-muted">
              Guests pay the price of the room they pick. Off: every room costs the same.
            </span>
          </span>
        </label>
      ) : (
        <p className="rounded-xl bg-royal-pale px-4 py-3 text-sm text-ink">
          Guests don’t choose a room: you place them in these from Trip Control, and everyone pays
          the trip’s one price, set in step 4.
        </p>
      )}
      {ownPrices && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">How to set the prices</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                [
                  'typed',
                  'Type each room’s price',
                  'You know what each room costs, as at a resort.',
                ],
                [
                  'weights',
                  'Split the trip’s cost by room weight',
                  'Enter the rent and fees in step 4; bigger rooms pay a bigger share. 1 is the baseline, 1.5 pays half again as much.',
                ],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className={`flex cursor-pointer flex-col gap-0.5 rounded-xl border-2 p-3 ${
                  pricing === value ? 'border-royal bg-royal-pale' : 'border-rule bg-white'
                }`}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <input
                    type="radio"
                    name="roomPricing"
                    checked={pricing === value}
                    onChange={() => onPricing(value)}
                    className="accent-royal"
                  />
                  {label}
                </span>
                <span className="text-sm text-body">{hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <p className="text-body">
        {typed
          ? 'Each price is per person. '
          : ownPrices
            ? 'Step 4 works out each room’s price per person from its weight. '
            : ''}
        &ldquo;Priced for&rdquo; is the fewest people the room is sold to: fewer than that and they
        pay for the empty places too. Guests see the beds as a picture.
      </p>
      <div className="flex flex-col gap-3">
        {rooms.map((r, i) => (
          <div
            key={i}
            className={`grid grid-cols-2 gap-2 rounded-xl border border-rule p-3 sm:items-end ${
              ownPrices
                ? 'sm:grid-cols-[3fr_2fr_1fr_2fr_1fr_auto]'
                : 'sm:grid-cols-[3fr_2fr_1fr_1fr_auto]'
            }`}
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
            {typed && (
              <Field label="Price per person">
                <Money
                  value={r.priceCents ? String(r.priceCents / 100) : ''}
                  onChange={(v) => {
                    const cents = Math.round(Number(v.replace(/[^0-9.]/g, '')) * 100)
                    setRoom(i, { priceCents: cents > 0 ? cents : null })
                  }}
                />
              </Field>
            )}
            {ownPrices && !typed && (
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
            )}
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
              {
                name: '',
                beds: '',
                capacity: 2,
                weight: 1,
                bedTypes: [],
                minPeople: 1,
                priceCents: null,
              },
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
export function roomProblem(r: TripRoom, pricing: RoomPricing = 'same'): string | null {
  if (!r.name.trim()) return 'Give this room a name.'
  if (!(r.capacity >= 1)) return 'A room sleeps at least 1.'
  if (pricing === 'typed' && !(r.priceCents && r.priceCents > 0))
    return 'Give this room a price per person.'
  if (pricing === 'weights' && !(r.weight > 0)) return 'Weight must be above 0 (1 is the baseline).'
  if (!(r.minPeople >= 1)) return '“Priced for” is at least 1.'
  if (r.minPeople > r.capacity) return '“Priced for” can’t be more than the room sleeps.'
  return null
}
