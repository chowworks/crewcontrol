import type { RoomPlanMove } from '@cc/types'
import { useState } from 'react'
import { Dialog } from '@/components/Dialog'
import { money } from '@/lib/format'
import type { Person } from '@/lib/roomPlan'

const chip: Record<'interested' | 'typed', string> = {
  interested: 'border-2 border-dashed border-royal bg-white text-royal',
  typed: 'border-2 border-dotted border-muted bg-rule italic text-ink',
}

/**
 * Apply rooms (issue #93): every guest who changes room and what it does to their balance, the names that stay in the
 * planner, and whether to email the guests. Nothing happens until the organizer presses Apply.
 */
export function ApplyRoomsDialog({
  moves,
  grown,
  plannerOnly,
  shared,
  names = true,
  onApply,
  onShare,
  onClose,
}: {
  moves: RoomPlanMove[]
  /** Rooms the organizer gave more places on the plan: applying makes them sleep that many. */
  grown: { name: string; from: number; to: number }[]
  /** People on beds who aren't guests on the trip: the Interested list and typed names. */
  plannerOnly: Person[]
  /** Whether accepted guests can see the floor plan now: the share box starts that way. */
  shared: boolean
  /** Whether accepted guests see names on it: applying keeps a plan shared with no names that way. */
  names?: boolean
  onApply: (email: boolean, share: boolean) => Promise<string | null>
  /** Shares the plan as it is, when there's nothing to apply. */
  onShare: () => Promise<string | null>
  onClose: () => void
}) {
  const [email, setEmail] = useState(false)
  const [share, setShare] = useState(shared)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const picked = moves.filter((m) => m.replacesOwnPick)
  const count = moves.length
  // Only someone moving into a room gets the email; leaving a room sends nothing.
  const roomed = moves.filter((m) => m.toRoom).length

  async function apply() {
    setBusy(true)
    setError(await onApply(email, share))
    setBusy(false)
  }

  async function shareNow() {
    setBusy(true)
    setError(await onShare())
    setBusy(false)
  }

  if (!count && !grown.length)
    return (
      <Dialog title="Everyone’s already in their room" onClose={onClose}>
        {error && (
          <p role="alert" className="mb-3 font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <p className="text-body">
          Every guest on your plan is in that room on the trip already, so there’s nothing to apply.
        </p>
        {!shared && (
          <p className="mt-2 text-body text-muted">
            You can still show this floor plan on the trip page. Accepted guests see who sleeps
            where; everyone else sees the rooms and beds with no names.
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          {!shared && (
            <button
              type="button"
              disabled={busy}
              onClick={shareNow}
              className="min-h-[44px] rounded-xl border-2 border-royal bg-white px-5 font-semibold text-royal hover:bg-royal-pale disabled:opacity-60"
            >
              Show the floor plan to guests
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-xl border-2 border-royal bg-royal px-5 font-semibold text-white hover:bg-royal-dark"
          >
            Keep planning
          </button>
        </div>
      </Dialog>
    )

  return (
    <Dialog title="Apply rooms to the trip?" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <p className="text-body text-muted">
          {count
            ? `This moves ${count} ${count === 1 ? 'guest' : 'guests'} on the trip.`
            : 'Nobody changes room.'}{' '}
          Everything else stays in your draft.
        </p>
        {grown.length > 0 && (
          <section>
            <h3 className="pb-1 text-sm font-semibold text-muted">
              Rooms that sleep more ({grown.length})
            </h3>
            <ul>
              {grown.map((g, i) => (
                <li key={i} className="border-t border-rule py-3">
                  <strong>
                    {g.name}: sleeps {g.to} (was {g.from})
                  </strong>
                </li>
              ))}
            </ul>
          </section>
        )}
        {count > 0 && (
          <section>
            <h3 className="pb-1 text-sm font-semibold text-muted">Moves ({count})</h3>
            <ul>
              {moves.map((m) => (
                <li key={m.guestId} className="flex flex-col gap-0.5 border-t border-rule py-3">
                  <strong>
                    {m.name}: {m.fromRoom ?? 'no room yet'} → {m.toRoom ?? 'no room'}
                  </strong>
                  <span className="text-sm text-muted">
                    {!m.toRoom
                      ? 'They’re on no bed in your plan, so they leave their room.'
                      : m.priceDiffCents > 0
                        ? `Adds a ${money(m.priceDiffCents)} charge to their balance.`
                        : m.priceDiffCents < 0
                          ? `Adds a ${money(-m.priceDiffCents)} credit to their balance.`
                          : 'Same price.'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {picked.length > 0 && (
          <p className="rounded-xl bg-royal-pale px-4 py-3 text-sm">
            {picked.map((m) => m.name).join(', ')}{' '}
            {picked.length === 1 ? 'picked a room' : 'picked their rooms'} when signing up. Applying
            replaces {picked.length === 1 ? 'that pick' : 'those picks'}.
          </p>
        )}
        {plannerOnly.length > 0 && (
          <section>
            <h3 className="pb-2 text-sm font-semibold text-muted">
              Stay in the planner only ({plannerOnly.length})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {plannerOnly.map((p) => (
                <span
                  key={p.key}
                  className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ${chip[p.kind === 'interested' ? 'interested' : 'typed']}`}
                >
                  {p.name}
                </span>
              ))}
            </div>
            <p className="mt-2 text-sm text-muted">
              They aren’t on the trip yet, so nothing is sent to them.
            </p>
          </section>
        )}
        {roomed > 0 && (
          <label className="flex min-h-[44px] items-center gap-3 border-t border-rule pt-3">
            <input
              type="checkbox"
              checked={email}
              onChange={(e) => setEmail(e.target.checked)}
              className="h-5 w-5 accent-royal"
            />
            Email the {roomed === 1 ? 'guest their' : `${roomed} guests their`} new room
          </label>
        )}
        <div className={`flex flex-col gap-1 ${roomed > 0 ? '' : 'border-t border-rule pt-3'}`}>
          <label className="flex min-h-[44px] items-center gap-3">
            <input
              type="checkbox"
              checked={share}
              onChange={(e) => setShare(e.target.checked)}
              className="h-5 w-5 accent-royal"
            />
            Show the floor plan on the trip page
          </label>
          <span className="pl-8 text-sm text-muted">
            {share
              ? shared && !names
                ? 'As you apply it now, with no names, as you shared it.'
                : 'As you apply it now. Accepted guests see who sleeps where; everyone else sees the rooms and beds with no names.'
              : shared
                ? 'Unticked, guests stop seeing the floor plan when you apply.'
                : 'Guests don’t see the floor plan. You can share it the next time you apply.'}
          </span>
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-xl border-2 border-royal px-5 font-semibold text-royal hover:bg-royal-pale"
          >
            Keep editing
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={apply}
            className="min-h-[44px] rounded-xl border-2 border-royal bg-royal px-5 font-semibold text-white hover:bg-royal-dark disabled:opacity-60"
          >
            Apply {count} {count === 1 ? 'move' : 'moves'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}

/**
 * Share on trip page (owner's decision, 2026-11-28): the rooms and beds go on the trip page as drawn now, with no names
 * and no prices, no Apply needed. Ticked, accepted guests also see who sleeps where, which needs everyone on the plan
 * in their room already (the server says so otherwise).
 */
export function ShareFloorPlanDialog({
  shared,
  names: wasNames,
  onShare,
  onClose,
}: {
  /** Whether it's on the trip page already: sharing again updates it. */
  shared: boolean
  names: boolean
  onShare: (names: boolean) => Promise<string | null>
  onClose: () => void
}) {
  const [names, setNames] = useState(shared && wasNames)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function share() {
    setBusy(true)
    setError(await onShare(names))
    setBusy(false)
  }

  return (
    <Dialog title="Show the floor plan on the trip page" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <p>
          Everyone who opens the trip page sees the rooms and beds as you’ve drawn them, with no
          names and no prices.{shared && ' This replaces the plan there now.'}
        </p>
        <div className="flex flex-col gap-1">
          <label className="flex min-h-[44px] items-center gap-3">
            <input
              type="checkbox"
              checked={names}
              onChange={(e) => setNames(e.target.checked)}
              className="h-5 w-5 accent-royal"
            />
            Show accepted guests who sleeps where
          </label>
          <span className="pl-8 text-sm text-muted">
            {names
              ? 'Only accepted guests see names. Apply rooms first if anyone on the plan still needs to move.'
              : 'Nobody sees names, accepted guests included.'}
          </span>
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-xl border-2 border-royal px-5 font-semibold text-royal hover:bg-royal-pale"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={share}
            className="min-h-[44px] rounded-xl border-2 border-royal bg-royal px-5 font-semibold text-white hover:bg-royal-dark disabled:opacity-60"
          >
            {shared ? 'Update the trip page' : 'Share'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
