import {
  CHANGE_NOTE_MAX,
  CHANGE_REPLY_MAX,
  type ChangeCloseInput,
  type ChangeRequestStatus,
  type OrganizerTrip,
  type TripChangeRequest,
} from '@cc/types'
import { ArrowLeftRight } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { avatarColor } from '@/components/Announcements'
import { Dialog } from '@/components/Dialog'
import { useToast } from '@/components/Toast'
import { api, ApiError } from '@/lib/api'
import { IconCircle } from './TripGuests'
import { Choice } from './TripQuestions'

// Trip Control's trip change requests (issue #82; owner's decisions, 2026-11-15): an accepted guest asks for a change
// in their own words. Each open request is one of the Actions; organizers keep notes on it (never shown to the guest)
// and close it as done or not possible, with a message we email the guest. The card listing every request, open and
// closed, sits under the guests once there is one.

const filled =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-dark disabled:opacity-60'
const outlined =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale'
const field =
  'w-full resize-y rounded-lg border border-[#5B6B80] bg-white px-3 py-2.5 text-base text-ink focus:outline-none focus:ring-2 focus:ring-royal'
const tagBase = 'rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide'

const firstName = (name: string) => name.split(' ')[0] || 'them'
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

/** Open, done or not possible, as a small tag. The guest's own page says "Waiting" for open. */
export function StatusTag({
  status,
  guest = false,
}: {
  status: ChangeRequestStatus
  guest?: boolean
}) {
  const [label, colour] =
    status === 'open'
      ? [guest ? 'Waiting for an answer' : 'Open', 'bg-[#FDF1D8] text-[#6B4A0B]']
      : status === 'done'
        ? ['Done', 'bg-royal-pale text-royal']
        : ['Not possible', 'bg-[#F2F4F7] text-[#344054]']
  return <span className={`${tagBase} ${colour}`}>{label}</span>
}

/** Who it's about, and who asked when that's someone else (who looks after them). */
const who = (r: TripChangeRequest) =>
  r.requesterName && firstName(r.requesterName) !== firstName(r.guestName)
    ? `${r.guestName} (asked by ${r.requesterName})`
    : r.guestName

type Open = { mode: 'details' | 'close'; id: string }

/**
 * Trip Control's change requests: the Actions rows for the open ones, and the card listing all of them (with the
 * dialogs). Reloaded when the trip changes.
 */
export function useTripChangeRequests(trip: OrganizerTrip | null): {
  actionRows: ReactNode[]
  card: ReactNode
} {
  const toast = useToast()
  const [data, setData] = useState<TripChangeRequest[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Open | null>(null)
  useEffect(() => {
    if (!trip) return
    api
      .getChangeRequests(trip.id)
      .then(setData)
      .catch(() => setError('Trip change requests could not be loaded.'))
  }, [trip])

  if (!trip) return { actionRows: [], card: null }
  const tripId = trip.id
  const list = data ?? []
  const current = open && list.find((r) => r.id === open.id)

  /** Resolves to why it didn't save, or null once it did. */
  async function change(
    step: () => Promise<TripChangeRequest[]>,
    done: string
  ): Promise<string | null> {
    try {
      setData(await step())
      toast({ text: done })
      // The red count in the account menu drops a request just closed.
      window.dispatchEvent(new Event('cc:actions-changed'))
      return null
    } catch (err) {
      return err instanceof ApiError ? err.message : 'That didn’t save. Try again.'
    }
  }

  const actionRows = list
    .filter((r) => r.status === 'open')
    .map((r) => (
      <li
        key={r.id}
        className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule py-3 first:border-t-0"
      >
        <div className="flex min-w-0 flex-[1_1_240px] items-start gap-3">
          <span
            aria-hidden="true"
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${avatarColor(r.guestName)} font-bold text-ink`}
          >
            {r.guestName.trim()[0]?.toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="font-semibold">
              {who(r)}
              <span className="font-normal text-muted"> · Trip change request</span>
            </div>
            <div className="line-clamp-3 text-sm text-body [overflow-wrap:anywhere]">
              “{r.request}”
            </div>
            {r.notes.length > 0 && (
              <div className="text-sm text-muted">
                {r.notes.length === 1 ? '1 note' : `${r.notes.length} notes`}, last{' '}
                {when(r.notes[r.notes.length - 1].createdAt)}
              </div>
            )}
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            className={filled}
            onClick={() => setOpen({ mode: 'close', id: r.id })}
          >
            Close request
          </button>
          <button
            type="button"
            className={outlined}
            onClick={() => setOpen({ mode: 'details', id: r.id })}
          >
            Details
          </button>
        </div>
      </li>
    ))

  const dialogs = current && open && (
    <>
      {open.mode === 'details' && (
        <DetailsDialog
          r={current}
          onClose={() => setOpen(null)}
          onCloseRequest={() => setOpen({ mode: 'close', id: current.id })}
          onNote={(text) =>
            change(() => api.addChangeNote(tripId, current.id, text), 'Note added.')
          }
        />
      )}
      {open.mode === 'close' && (
        <CloseDialog
          r={current}
          onClose={() => setOpen(null)}
          onSave={async (input) => {
            const who = firstName(current.requesterName)
            const problem = await change(
              () => api.closeChangeRequest(tripId, current.id, input),
              input.status === 'done'
                ? `Marked done. We emailed ${who}.`
                : `Closed as not possible. We emailed ${who}.`
            )
            if (!problem) setOpen(null)
            return problem
          }}
        />
      )}
    </>
  )

  const card =
    list.length === 0 && !error ? (
      // The dialogs open from the Actions rows too, so they live here whether or not the card shows.
      dialogs
    ) : (
      <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-card sm:p-6">
        <h2 className="flex items-center gap-3 text-xl font-extrabold">
          <IconCircle icon={ArrowLeftRight} />
          Trip change requests
        </h2>
        <p className="text-body">
          Changes guests asked for, open first. Only you and the trip’s other organizers see them
          and their notes.
        </p>
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <ul>
          {list.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule py-3 first:border-t-0"
            >
              <div className="min-w-0 flex-[1_1_240px]">
                <div className="flex flex-wrap items-center gap-2 font-semibold">
                  {who(r)}
                  <StatusTag status={r.status} />
                </div>
                <div className="line-clamp-2 text-[15px] text-body [overflow-wrap:anywhere]">
                  {r.request}
                </div>
                <div className="text-sm text-muted">
                  Asked {when(r.createdAt)}
                  {r.closedAt && ` · Closed ${when(r.closedAt)} by ${r.closedByName}`}
                  {r.notes.length > 0 &&
                    ` · ${r.notes.length === 1 ? '1 note' : `${r.notes.length} notes`}`}
                </div>
              </div>
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  className={outlined}
                  onClick={() => setOpen({ mode: 'details', id: r.id })}
                >
                  Details
                </button>
              </div>
            </li>
          ))}
        </ul>
        {dialogs}
      </section>
    )
  return { actionRows, card }
}

/** A request in full: what they asked, the organizers' notes (with a box to add one), and how it was closed. */
function DetailsDialog({
  r,
  onClose,
  onCloseRequest,
  onNote,
}: {
  r: TripChangeRequest
  onClose: () => void
  onCloseRequest: () => void
  onNote: (text: string) => Promise<string | null>
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tooLong = note.trim().length > CHANGE_NOTE_MAX

  async function add() {
    if (!note.trim() || tooLong || busy) return
    setBusy(true)
    const problem = await onNote(note.trim())
    setBusy(false)
    setError(problem)
    if (!problem) setNote('')
  }

  return (
    <Dialog title={`${firstName(r.guestName)}’s trip change request`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <StatusTag status={r.status} />
            {r.requesterName} asked {when(r.createdAt)}
            {firstName(r.requesterName) !== firstName(r.guestName) && `, for ${r.guestName}`}
          </div>
          <p className="whitespace-pre-wrap rounded-xl bg-ground px-4 py-3 text-body [overflow-wrap:anywhere]">
            {r.request}
          </p>
        </div>
        {r.closedAt && (
          <div className="flex flex-col gap-1">
            <h3 className="font-bold">
              {r.status === 'done' ? 'Marked done' : 'Closed as not possible'} by {r.closedByName},{' '}
              {when(r.closedAt)}
            </h3>
            <p className="whitespace-pre-wrap text-body [overflow-wrap:anywhere]">
              {r.reply ?? 'No message to the guest.'}
            </p>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <h3 className="font-bold">Notes</h3>
          {r.notes.length === 0 ? (
            <p className="text-sm text-muted">None yet.</p>
          ) : (
            <ul>
              {r.notes.map((n) => (
                <li key={n.id} className="border-t border-rule py-2 first:border-t-0">
                  <p className="whitespace-pre-wrap text-body [overflow-wrap:anywhere]">{n.text}</p>
                  <p className="text-sm text-muted">
                    {n.authorName} · {when(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex flex-col gap-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              void add()
            }}
          >
            <label htmlFor="change-note" className="font-semibold">
              Add a note to track what’s happening
            </label>
            <textarea
              id="change-note"
              rows={3}
              className={field}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {tooLong && (
              <p className="text-sm font-semibold text-[#B42318]">
                Keep it to {CHANGE_NOTE_MAX.toLocaleString('en-US')} characters.
              </p>
            )}
            <p className="rounded-xl bg-royal-pale px-4 py-3 text-sm text-body">
              Only the trip’s organizers see notes. {firstName(r.requesterName)} never does.
            </p>
            <div className="flex flex-wrap justify-end gap-2.5">
              <button type="submit" className={outlined} disabled={!note.trim() || tooLong || busy}>
                {busy ? 'Adding…' : 'Add note'}
              </button>
              {r.status === 'open' && (
                <button type="button" className={filled} onClick={onCloseRequest}>
                  Close request
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </Dialog>
  )
}

/** Closing a request: done or not possible, and the message we email the guest. */
function CloseDialog({
  r,
  onClose,
  onSave,
}: {
  r: TripChangeRequest
  onClose: () => void
  onSave: (input: ChangeCloseInput) => Promise<string | null>
}) {
  const [status, setStatus] = useState<'done' | 'declined'>('done')
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = firstName(r.requesterName)
  const problem =
    reply.trim().length > CHANGE_REPLY_MAX
      ? `Keep it to ${CHANGE_REPLY_MAX.toLocaleString('en-US')} characters.`
      : status === 'declined' && !reply.trim()
        ? `Tell ${name} why it’s not possible.`
        : null

  async function submit() {
    if (problem || busy) return
    setBusy(true)
    const failed = await onSave({ status, reply: reply.trim() })
    setBusy(false)
    setError(failed)
  }

  return (
    <Dialog title={`Close ${firstName(r.guestName)}’s request`} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <p className="whitespace-pre-wrap rounded-xl bg-ground px-4 py-3 text-body [overflow-wrap:anywhere]">
          {r.request}
        </p>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-semibold">How did it go?</legend>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Choice
              checked={status === 'done'}
              onChange={() => setStatus('done')}
              title="Done"
              line="You made the change"
            />
            <Choice
              checked={status === 'declined'}
              onChange={() => setStatus('declined')}
              title="Not possible"
              line="You can’t make this change"
            />
          </div>
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="change-reply" className="font-semibold">
            {status === 'done'
              ? `Add a quick note for ${name} about what changed (optional)`
              : `Tell ${name} why it’s not possible`}
          </label>
          <textarea
            id="change-reply"
            rows={4}
            className={field}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          {problem && <p className="text-sm font-semibold text-[#B42318]">{problem}</p>}
        </div>
        <p className="rounded-xl bg-royal-pale px-4 py-3 text-sm text-body">
          We email {name} that it’s {status === 'done' ? 'done' : 'not possible'}, with your note.
          Closing it doesn’t change their room, balance or spot: do that on their Details first.
        </p>
        <div className="flex flex-wrap justify-end gap-2.5">
          <button type="button" className={outlined} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={filled} disabled={Boolean(problem) || busy}>
            {busy ? 'Saving…' : status === 'done' ? 'Mark done' : 'Close as not possible'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
