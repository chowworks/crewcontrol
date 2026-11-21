// DESIGN EXPERIMENT (issue #93, 2026-11-21): where Trip Control opens the room planner, behind ?placement=a|b|c.
// When the owner picks one, keep it, delete the others, this file's switch and the parameter handling.
import { BedDouble, Lock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { IconCircle } from './TripGuests'

export type Placement = 'a' | 'b' | 'c'

export const PLACEMENTS = [
  { value: 'a', label: 'A · Manage Guests' },
  { value: 'b', label: 'B · Thin row' },
  { value: 'c', label: 'C · Rooms card' },
]

export const placementOf = (search: string): Placement | null => {
  const p = new URLSearchParams(search).get('placement')
  return p === 'a' || p === 'b' || p === 'c' ? p : null
}

const plannerLink = (tripId: string, admin: boolean) =>
  admin ? `/admin/trips/${tripId}/planner` : `/organize/${tripId}/planner`

/** A: an outlined button at the right of the Manage Guests heading. */
export function PlannerHeadingButton({
  tripId,
  admin,
  locked,
}: {
  tripId: string
  admin: boolean
  locked: boolean
}) {
  return (
    <Link
      to={plannerLink(tripId, admin)}
      className="ml-auto inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-royal px-3 text-base font-semibold text-royal hover:bg-royal-pale"
    >
      {locked ? (
        <Lock className="h-4 w-4" aria-hidden="true" />
      ) : (
        <BedDouble className="h-4 w-4" aria-hidden="true" />
      )}
      Room planner
    </Link>
  )
}

/** B: one thin light-purple row above Manage Guests, as "Request a feature" and "Advertise your trip" are. */
export function PlannerRow({
  tripId,
  admin,
  locked,
}: {
  tripId: string
  admin: boolean
  locked: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-royal-pale px-4 py-2">
      <p className="flex items-center gap-2 text-sm text-ink">
        <BedDouble className="h-4 w-4 shrink-0 text-royal" aria-hidden="true" />
        {locked
          ? 'Work out who sleeps where with the room planner, a paid feature.'
          : 'Work out who sleeps where: lay out the house and drag people onto beds.'}
      </p>
      <Link
        to={plannerLink(tripId, admin)}
        className="relative inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border border-royal bg-white px-3 text-sm font-semibold text-royal after:absolute after:-inset-1 hover:bg-royal-pale"
      >
        {locked && <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
        Open room planner
      </Link>
    </div>
  )
}

/** C: a Rooms card above Manage Guests: how full the rooms are, and the way into the planner. */
export function PlannerCard({
  tripId,
  admin,
  locked,
  beds,
  roomed,
  going,
}: {
  tripId: string
  admin: boolean
  locked: boolean
  /** Places in all the rooms. */
  beds: number
  /** Guests on the trip with a room. */
  roomed: number
  /** Guests on the trip (not turned down). */
  going: number
}) {
  const without = going - roomed
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-card sm:flex-row sm:items-center sm:p-6">
      <div className="flex flex-1 flex-col gap-1">
        <h2 className="flex items-center gap-3 text-xl font-extrabold">
          <IconCircle icon={BedDouble} />
          Rooms
        </h2>
        <p className="text-body">
          {roomed} of {beds} beds taken.{' '}
          {without > 0
            ? `${without} ${without === 1 ? 'guest has' : 'guests have'} no room yet.`
            : 'Everyone has a room.'}
        </p>
      </div>
      <Link
        to={plannerLink(tripId, admin)}
        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 self-start rounded-xl border-2 border-royal bg-royal px-4 font-semibold text-white hover:bg-royal-dark sm:self-center"
      >
        {locked && <Lock className="h-4 w-4" aria-hidden="true" />}
        Open room planner
      </Link>
    </section>
  )
}
