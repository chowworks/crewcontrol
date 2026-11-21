import { Check } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Dialog } from '@/components/Dialog'
import { AskDialog } from './PaidFeaturesPage'

const filled =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-royal bg-royal px-4 font-semibold text-white hover:bg-royal-dark'
const outlined =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-royal bg-white px-4 font-semibold text-royal hover:bg-royal-pale'

/**
 * What an organizer sees on pressing a way into the room planner when the trip doesn't have it (owner's decision,
 * 2026-11-21): what the planner does, with a picture, and the way to ask for it.
 */
export function PlannerAd({ onClose }: { onClose: () => void }) {
  const [asking, setAsking] = useState(false)
  if (asking) return <AskDialog feature="room_planner" onClose={onClose} onSent={() => {}} />
  return (
    <Dialog title="Room planner" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <img
          src="/paid/room-planner.webp"
          alt="Two rooms on the planner: guests' names on a king bed and on two bunks."
          width={960}
          height={459}
          className="w-full rounded-xl border border-rule"
        />
        <p className="text-lg font-bold text-ink">
          Work out who sleeps where, without a spreadsheet.
        </p>
        <ul className="flex flex-col gap-2 text-body">
          {[
            'Lay out the house: rooms, bathrooms and floors.',
            'Drag guests, the Interested list and plus-ones onto beds.',
            'Save a draft, then apply rooms. Room prices go onto each guest’s balance.',
          ].map((line) => (
            <li key={line} className="flex gap-2">
              <Check className="mt-1 h-4 w-4 shrink-0 text-royal" aria-hidden="true" />
              {line}
            </li>
          ))}
        </ul>
        <p className="rounded-xl bg-royal-pale px-4 py-3 text-sm">
          The room planner is a paid feature, being tried by a few organizers first.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setAsking(true)} className={filled}>
            Ask for early access
          </button>
          <Link to="/organize/features" className={outlined}>
            See paid features
          </Link>
        </div>
      </div>
    </Dialog>
  )
}
