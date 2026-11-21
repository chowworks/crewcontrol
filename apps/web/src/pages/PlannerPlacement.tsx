// DESIGN EXPERIMENT (issue #93, 2026-11-21): the thin row on Trip Control that opens the room planner, behind
// ?placement=b1|b2|b3. When the owner picks one, keep it, delete the others, the switch and the parameter handling.
import { BedDouble, Lock } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PlannerAd } from './PlannerAd'

export type Placement = 'b1' | 'b2' | 'b3'

export const PLACEMENTS = [
  { value: 'b1', label: 'B1 · What it does' },
  { value: 'b2', label: 'B2 · Beds taken' },
  { value: 'b3', label: 'B3 · Both' },
]

export const placementOf = (search: string): Placement | null => {
  const p = new URLSearchParams(search).get('placement')
  return p === 'b1' || p === 'b2' || p === 'b3' ? p : null
}

interface RowProps {
  tripId: string
  admin: boolean
  /** The trip doesn't have the planner: the button opens what it is instead. */
  locked: boolean
  /** Places in all the rooms. */
  beds: number
  /** Guests on the trip with a room. */
  roomed: number
  /** Guests on the trip (not turned down). */
  going: number
}

const status = ({ beds, roomed, going }: RowProps) => {
  const without = going - roomed
  return `${roomed} of ${beds} beds taken. ${
    without > 0
      ? `${without} ${without === 1 ? 'guest has' : 'guests have'} no room yet.`
      : 'Everyone has a room.'
  }`
}

/** The row's button: into the planner, or, when the trip doesn't have it, what the planner is. */
function OpenButton({ tripId, admin, locked, solid }: RowProps & { solid?: boolean }) {
  const [ad, setAd] = useState(false)
  // Drawn 36px tall; the ::after keeps the tap area at 44px, as on the other thin rows.
  const className = `relative inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border border-royal px-3 text-sm font-semibold after:absolute after:-inset-1 ${
    solid ? 'bg-royal text-white hover:bg-royal-dark' : 'bg-white text-royal hover:bg-royal-pale'
  }`
  if (locked)
    return (
      <>
        <button type="button" onClick={() => setAd(true)} className={className}>
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          Open room planner
        </button>
        {ad && <PlannerAd onClose={() => setAd(false)} />}
      </>
    )
  return (
    <Link
      to={admin ? `/admin/trips/${tripId}/planner` : `/organize/${tripId}/planner`}
      className={className}
    >
      Open room planner
    </Link>
  )
}

function Row({ children, button }: { children: ReactNode; button: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-royal-pale px-4 py-2">
      <div className="flex items-center gap-2 text-sm text-ink">
        <BedDouble className="h-4 w-4 shrink-0 text-royal" aria-hidden="true" />
        {children}
      </div>
      {button}
    </div>
  )
}

/** B1: what the planner does. */
export function PlannerRowPitch(props: RowProps) {
  return (
    <Row button={<OpenButton {...props} />}>
      <p>Work out who sleeps where: lay out the house and drag people onto beds.</p>
    </Row>
  )
}

/** B2: how full the rooms are. */
export function PlannerRowStatus(props: RowProps) {
  return (
    <Row button={<OpenButton {...props} />}>
      <p>
        <span className="font-semibold">Rooms:</span> {status(props)}
      </p>
    </Row>
  )
}

/** B3: its name and how full the rooms are, with a filled button. */
export function PlannerRowBoth(props: RowProps) {
  return (
    <Row button={<OpenButton {...props} solid />}>
      <p className="flex flex-col sm:flex-row sm:gap-1.5">
        <span className="font-semibold">Room planner</span>
        <span className="hidden sm:inline" aria-hidden="true">
          ·
        </span>
        <span>{status(props)}</span>
      </p>
    </Row>
  )
}
