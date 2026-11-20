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
  plannerOnly,
  onApply,
  onClose,
}: {
  moves: RoomPlanMove[]
  /** People on beds who aren't guests on the trip: the Interested list and typed names. */
  plannerOnly: Person[]
  onApply: (email: boolean) => Promise<string | null>
  onClose: () => void
}) {
  const [email, setEmail] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const picked = moves.filter((m) => m.replacesOwnPick)
  const count = moves.length

  async function apply() {
    setBusy(true)
    setError(await onApply(email))
    setBusy(false)
  }

  if (!count)
    return (
      <Dialog title="Everyone’s already in their room" onClose={onClose}>
        <p className="text-body">
          Every guest on your plan is in that room on the trip already, so there’s nothing to apply.
        </p>
        <div className="mt-5 flex justify-end">
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
          This moves {count} {count === 1 ? 'guest' : 'guests'} on the trip. Everything else stays
          in your draft.
        </p>
        <section>
          <h3 className="pb-1 text-sm font-semibold text-muted">Moves ({count})</h3>
          <ul>
            {moves.map((m) => (
              <li key={m.guestId} className="flex flex-col gap-0.5 border-t border-rule py-3">
                <strong>
                  {m.name}: {m.fromRoom ?? 'no room yet'} → {m.toRoom}
                </strong>
                <span className="text-sm text-muted">
                  {m.priceDiffCents > 0
                    ? `Adds a ${money(m.priceDiffCents)} charge to their balance.`
                    : m.priceDiffCents < 0
                      ? `Adds a ${money(-m.priceDiffCents)} credit to their balance.`
                      : 'Same price.'}
                </span>
              </li>
            ))}
          </ul>
        </section>
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
        <label className="flex min-h-[44px] items-center gap-3 border-t border-rule pt-3">
          <input
            type="checkbox"
            checked={email}
            onChange={(e) => setEmail(e.target.checked)}
            className="h-5 w-5 accent-royal"
          />
          Email the {count === 1 ? 'guest their' : `${count} guests their`} new room
        </label>
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
