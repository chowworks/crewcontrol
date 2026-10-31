import type { InterestedPerson, OrganizerTrip } from '@cc/types'
import { Download, Star } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { avatarColor } from '@/components/Announcements'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/components/Toast'
import { api, ApiError } from '@/lib/api'
import { type Cell, downloadCsv, fileSlug, stamp } from '@/lib/csv'
import { shortDate } from '@/lib/format'
import { IconCircle } from './TripGuests'

// Trip Control's Interested list (issue #47; owner's decisions, 2026-10-31): who said "I'm interested" on the save the
// date, whether they've signed up since, with Remove and a spreadsheet. It stays after sign-ups open. While the trip is a
// save the date, one of the Actions is Launch Trip Sign-Ups, emailing everyone interested as part of it (owner's decision,
// 2026-10-31: the action is the trip's, not each person's).

const filled =
  'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-dark disabled:opacity-60'
const outlined =
  'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale'
const tag = 'rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide'

/** The Interested list as spreadsheet rows; also in "Download everything". */
export function interestRows(people: InterestedPerson[]): Cell[][] {
  return [
    [
      'First name',
      'Last name',
      'Email',
      'Phone',
      'Interested on',
      'Signed up',
      'Told sign-ups are open',
    ],
    ...people.map((p) => [
      p.firstName,
      p.lastName,
      p.email,
      p.phone,
      stamp(p.createdAt),
      p.signed ? 'Yes' : 'No',
      stamp(p.toldAt),
    ]),
  ]
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Trip Control's interest list: its Actions row (open sign-ups, on a save the date) and its card. */
export function useTripInterest(
  trip: OrganizerTrip | null,
  onTrip: (t: OrganizerTrip) => void
): {
  actionRows: ReactNode[]
  card: ReactNode
} {
  const toast = useToast()
  const [people, setPeople] = useState<InterestedPerson[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<InterestedPerson | null>(null)
  const [telling, setTelling] = useState(false)
  const [opening, setOpening] = useState(false)
  const [emailThem, setEmailThem] = useState(true)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!trip) return
    api
      .getInterest(trip.id)
      .then(setPeople)
      .catch(() => setError('The Interested list could not be loaded.'))
  }, [trip])

  if (!trip) return { actionRows: [], card: null }
  const tripId = trip.id
  const list = people ?? []
  // Nothing on a trip that never was a save the date.
  if (list.length === 0 && !trip.saveTheDate) return { actionRows: [], card: null }

  const toTell = list.filter((p) => !p.signed && !p.toldAt)
  const open = !trip.saveTheDate && trip.published

  async function remove(p: InterestedPerson) {
    try {
      setPeople(await api.removeInterest(tripId, p.id))
      setError(null)
      toast({ text: `${p.firstName} is off the Interested list.` })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That didn’t save. Try again.')
    }
    setRemoving(null)
  }

  async function tell() {
    setBusy(true)
    try {
      const { told } = await api.tellInterested(tripId)
      setPeople(await api.getInterest(tripId))
      setError(null)
      toast({
        text:
          told === toTell.length
            ? `Emailed ${plural(told, 'person', 'people')} that sign-ups are open.`
            : `Emailed ${told} of ${toTell.length}. The rest didn’t send; try again later.`,
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That didn’t send. Try again.')
    }
    setBusy(false)
    setTelling(false)
  }

  async function openSignups() {
    setBusy(true)
    const email = emailThem && toTell.length > 0
    try {
      const { trip: saved, told } = await api.openSignups(tripId, email)
      onTrip(saved)
      setPeople(await api.getInterest(tripId))
      setError(null)
      toast({
        text: !email
          ? 'Sign-ups are open.'
          : told === toTell.length
            ? `Sign-ups are open. Emailed ${plural(told, 'person', 'people')}.`
            : `Sign-ups are open. Emailed ${told} of ${toTell.length}; send the rest from Interested.`,
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That didn’t save. Try again.')
    }
    setBusy(false)
    setOpening(false)
  }

  function download() {
    downloadCsv(`${fileSlug(trip!.name)}-interested`, interestRows(list))
    toast({ text: 'Downloaded Interested.' })
  }

  const actionRows =
    trip.saveTheDate && trip.published
      ? [
          <li
            key="interest-open"
            className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule py-3 first:border-t-0"
          >
            <div className="min-w-0 flex-[1_1_200px]">
              <div className="flex items-center gap-1.5 font-semibold">
                <span aria-hidden="true">🚀</span>
                Launch Trip Sign-Ups
              </div>
              <div className="text-sm text-body">
                {list.length === 0
                  ? 'No one has said they’re interested yet. Launch sign-ups when you’re ready.'
                  : `${plural(list.length, 'person', 'people')} said they’re interested. Launch sign-ups when you’re ready.`}
              </div>
            </div>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                className={filled}
                onClick={() => {
                  setEmailThem(true)
                  setOpening(true)
                }}
              >
                Launch
              </button>
            </div>
          </li>,
        ]
      : []

  const card = (
    <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-xl font-extrabold">
          <IconCircle icon={Star} />
          Interested
          {list.length > 0 && <span className="font-normal text-muted">{list.length}</span>}
        </h2>
        <div className="flex flex-wrap gap-2">
          {/* Sign-ups opened from the editor, or some emails didn't go: the rest can still be told. */}
          {open && toTell.length > 0 && (
            <button type="button" className={outlined} onClick={() => setTelling(true)}>
              Email {plural(toTell.length, 'person', 'people')}
            </button>
          )}
          {list.length > 0 && (
            <button type="button" className={outlined} onClick={download}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Download
            </button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      <p className="text-body">
        {trip.saveTheDate
          ? 'Your trip is a save the date: the trip page asks people if they’re interested. Launch sign-ups from Actions when you’re ready.'
          : 'People who said they’re interested before sign-ups opened. Only you see this list.'}
      </p>
      {people && list.length === 0 && (
        <p className="rounded-xl bg-ground p-4 text-body">No one yet.</p>
      )}
      {list.length > 0 && (
        <ul>
          {list.map((p) => {
            const name = `${p.firstName} ${p.lastName}`.trim()
            return (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule py-3 first:border-t-0"
              >
                <div className="flex min-w-0 flex-[1_1_240px] items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${avatarColor(name)} font-bold text-ink`}
                  >
                    {name[0]?.toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 font-semibold">
                      {name}
                      {p.signed ? (
                        <span className={`${tag} bg-royal-pale text-royal`}>Signed up</span>
                      ) : (
                        p.toldAt && <span className={`${tag} bg-ground text-body`}>Emailed</span>
                      )}
                    </div>
                    <div className="text-sm text-body [overflow-wrap:anywhere]">
                      {p.email} · {p.phone} · {shortDate(p.createdAt.slice(0, 10))}
                    </div>
                  </div>
                </div>
                <div className="ml-auto flex gap-2">
                  <button type="button" className={outlined} onClick={() => setRemoving(p)}>
                    Remove
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.firstName}?`}
          confirmLabel="Remove"
          onConfirm={() => void remove(removing)}
          onCancel={() => setRemoving(null)}
        >
          <p className="text-body">
            They come off the Interested list and aren’t told. They can say they’re interested again
            while the trip is a save the date.
          </p>
        </ConfirmDialog>
      )}
      {opening && (
        <ConfirmDialog
          title="Launch Trip Sign-Ups?"
          confirmLabel={busy ? 'Launching…' : 'Launch sign-ups'}
          disabled={busy}
          onConfirm={() => void openSignups()}
          onCancel={() => setOpening(false)}
        >
          <p className="text-body">
            The trip page shows “I want to join”, and people can sign the trip agreement.
          </p>
          {toTell.length > 0 && (
            <label className="mt-3 flex items-start gap-3 text-body">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-royal"
                checked={emailThem}
                onChange={(e) => setEmailThem(e.target.checked)}
              />
              <span>
                Email the {plural(toTell.length, 'person', 'people')} who said they’re interested,
                with a link to sign up. Replies come to you.
              </span>
            </label>
          )}
        </ConfirmDialog>
      )}
      {telling && (
        <ConfirmDialog
          title="Email them that sign-ups are open?"
          confirmLabel={busy ? 'Sending…' : `Email ${plural(toTell.length, 'person', 'people')}`}
          disabled={busy}
          onConfirm={() => void tell()}
          onCancel={() => setTelling(false)}
        >
          <p className="text-body">
            Each gets the “Sign-ups are open” email with a link to sign up. Replies come to you.
          </p>
        </ConfirmDialog>
      )}
    </section>
  )
  return { actionRows, card }
}
