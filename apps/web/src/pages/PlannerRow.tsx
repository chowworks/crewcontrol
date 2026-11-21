import { BedDouble, Lock } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PlannerAd } from './PlannerAd'

/**
 * Trip Control's way into the room planner (issue #93; owner's pick, 2026-11-21): one thin light-purple row between
 * Trip Financials and Manage Guests, as "Request a feature" is. When the trip doesn't have the planner, the button
 * opens what it is instead.
 */
export function PlannerRow({
  tripId,
  admin,
  locked,
}: {
  tripId: string
  admin: boolean
  locked: boolean
}) {
  const [ad, setAd] = useState(false)
  // Drawn 36px tall; the ::after keeps the tap area at 44px, as on the other thin rows.
  const button =
    'relative inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border border-royal bg-royal px-3 text-sm font-semibold text-white after:absolute after:-inset-1 hover:bg-royal-dark'
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-royal-pale px-4 py-2">
      <div className="flex items-center gap-2 text-sm text-ink">
        <BedDouble className="h-4 w-4 shrink-0 text-royal" aria-hidden="true" />
        <p className="flex flex-col sm:flex-row sm:gap-1.5">
          <span className="font-semibold">Room planner</span>
          <span className="hidden sm:inline" aria-hidden="true">
            ·
          </span>
          <span>Work out who sleeps where: lay out the house and drag people onto beds.</span>
        </p>
      </div>
      {locked ? (
        <button type="button" onClick={() => setAd(true)} className={button}>
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          Open room planner
        </button>
      ) : (
        <Link
          to={admin ? `/admin/trips/${tripId}/planner` : `/organize/${tripId}/planner`}
          className={button}
        >
          Open room planner
        </Link>
      )}
      {ad && <PlannerAd onClose={() => setAd(false)} />}
    </div>
  )
}
