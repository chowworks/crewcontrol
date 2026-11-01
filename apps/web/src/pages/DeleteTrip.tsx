import type { OrganizerTrip } from '@cc/types'
import { Check, Download, Trash2, TriangleAlert, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Dialog } from '@/components/Dialog'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api'
import { circle } from './EditTripSteps'
import { downloadEverything } from './TripExport'

// Deleting a trip (issue #2; owner's decisions, 2026-10-30): from the Danger zone at the bottom of Trip Control, owners
// only, in two steps: download everything about the trip as one zip, then delete. The trip is hidden at once, each guest who
// signed is emailed their signed agreement and payments, an owner can restore it from Your trips for 30 days, and
// then it is erased for good.

const outlined =
  'inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale'
const filled =
  'inline-flex min-h-[52px] items-center justify-center rounded-xl bg-royal px-4 text-[17px] font-semibold text-white hover:bg-royal-dark disabled:opacity-50'

/** "Nov 29" (with the year when it isn't this year's), for when a deleted trip is erased. */
export function eraseDay(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
  })
}

/** Download everything, with its toast; the error's message when it fails. */
function useDownloadEverything(tripId: string) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  async function run(): Promise<string | null> {
    setBusy(true)
    try {
      const trip = await api.getTrip(tripId)
      await downloadEverything(trip)
      toast({ text: `Downloaded everything for ${trip.name}.` })
      return null
    } catch (err) {
      return err instanceof Error ? err.message : 'The download failed.'
    } finally {
      setBusy(false)
    }
  }
  return { busy, run }
}

/** The Danger zone, last on Trip Control: shown to the trip's owners only, never on a sample trip. */
export function DangerZone({ tripId, tripName }: { tripId: string; tripName: string }) {
  const [owner, setOwner] = useState(false)
  const [open, setOpen] = useState(false)
  const download = useDownloadEverything(tripId)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api.getPeople(tripId, false).then(
      (p) => setOwner(p.canManage && !p.isSample),
      () => setOwner(false)
    )
  }, [tripId])
  if (!owner) return null
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-[#B42318]/40 bg-white p-5 shadow-card sm:p-6">
      <h2 className="flex items-center gap-3 text-xl font-extrabold text-[#B42318]">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#FEE4E2]">
          <TriangleAlert className="h-5 w-5" aria-hidden="true" />
        </span>
        Danger zone
      </h2>
      {error && (
        <p role="alert" className="font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      {/* Moved here from Trip Control's header (owner's decision, 2026-11-01). */}
      <div className="flex flex-col gap-3 border-t border-rule pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Manage owners and organizers</p>
          <p className="text-body">Who can run this trip with you, and who can change who.</p>
        </div>
        <Link to={`/organize/${tripId}/people`} className={`${outlined} shrink-0`}>
          <Users className="h-4 w-4" aria-hidden="true" />
          Manage
        </Link>
      </div>
      <div className="flex flex-col gap-3 border-t border-rule pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Download everything</p>
          <p className="text-body">
            Guests, payments, the trip log, signed agreements, photos and announcements, in one zip.
          </p>
        </div>
        <button
          type="button"
          onClick={async () => setError(await download.run())}
          disabled={download.busy}
          className={`${outlined} shrink-0`}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {download.busy ? 'Preparing…' : 'Download'}
        </button>
      </div>
      <div className="flex flex-col gap-3 border-t border-rule pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Delete this trip</p>
          <p className="text-body">
            Takes the trip down for everyone. You can restore it for 30 days, then it’s erased for
            good.
          </p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className={`${outlined} shrink-0`}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Delete trip
        </button>
      </div>
      {open && (
        <DeleteTripDialog tripId={tripId} tripName={tripName} onClose={() => setOpen(false)} />
      )}
    </section>
  )
}

function DeleteTripDialog({
  tripId,
  tripName,
  onClose,
}: {
  tripId: string
  tripName: string
  onClose: () => void
}) {
  const [trip, setTrip] = useState<OrganizerTrip | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()
  const download = useDownloadEverything(tripId)

  useEffect(() => {
    api.getTrip(tripId).then(setTrip, () => setTrip(null))
  }, [tripId])

  const signed = trip?.guests.filter((g) => g.signedAt).length ?? 0
  const [step, setStep] = useState<1 | 2>(1)
  const [downloaded, setDownloaded] = useState(false)
  const [typed, setTyped] = useState('')
  const nameMatches = typed.trim() === tripName.trim()

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      const { eraseOn } = await api.deleteTrip(tripId)
      toast({
        text: `Deleted ${tripName}. You can restore it until ${eraseDay(eraseOn)}.`,
        action: {
          label: 'Undo',
          onClick: () =>
            void api.restoreTrip(tripId).then(() => {
              toast({ text: `Restored ${tripName}. Publish it again when you’re ready.` })
              window.dispatchEvent(new Event('cc:trips-changed'))
            }),
        },
      })
      navigate('/organize')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The trip was not deleted.')
      setBusy(false)
    }
  }

  return (
    <Dialog title={`Delete ${tripName}?`} onClose={onClose}>
      <div className="flex flex-col gap-4 text-body">
        <Timeline step={step} canDelete={downloaded} onStep={setStep} />
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        {step === 1 ? (
          <>
            <p className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
              Download everything first. Once the trip is erased, nobody can get it back.
            </p>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 font-semibold text-ink">
                  {downloaded && <Check className="h-5 w-5 text-royal" aria-label="Downloaded" />}
                  Everything, in one zip
                </p>
                <p className="text-sm">
                  Guests and balances, payments, vendor costs, the trip log, signed agreements,
                  photos, questions and announcements.
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const failed = await download.run()
                  setError(failed)
                  if (!failed) setDownloaded(true)
                }}
                disabled={download.busy}
                className={`${outlined} shrink-0`}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                {download.busy ? 'Preparing…' : downloaded ? 'Again' : 'Download'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!downloaded}
              className={filled}
            >
              {downloaded ? 'Next' : 'Download to go on'}
            </button>
          </>
        ) : (
          <>
            <div>
              <p className="font-semibold text-ink">What happens</p>
              <ul className="mt-1 list-disc pl-5">
                <li>The trip page and sign-ups come down, and reminders stop.</li>
                <li>
                  {signed === 1
                    ? 'The guest who signed gets an email with their signed agreement and payments.'
                    : `Each guest who signed${signed ? ` (${signed})` : ''} gets an email with their signed agreement and payments.`}
                </li>
                <li>You can restore it from Your trips for 30 days. Then it’s erased for good.</li>
              </ul>
            </div>
            {/* Typing the name slows a delete down enough to be sure it's the right trip, as GitHub does. */}
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
              <span>
                Type <strong className="select-all">{tripName}</strong> to confirm
              </span>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="rounded-[10px] border border-[#5B6B80] bg-white px-3.5 py-3 text-base font-normal text-ink focus:outline-none focus:ring-2 focus:ring-royal"
              />
            </label>
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                onClick={remove}
                disabled={busy || !nameMatches}
                className={`${filled} sm:flex-1`}
              >
                {busy ? 'Deleting…' : 'Delete trip'}
              </button>
              <button
                type="button"
                onClick={() => setStep(1)}
                className={`${outlined} min-h-[52px] justify-center px-4 text-base`}
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}

const STEPS = ['Download everything', 'Delete the trip']

/**
 * The dialog's two steps as numbered circles joined by a line, as the trip editor shows its steps: the current one
 * filled, a finished one outlined with a tick. Step 2 opens only once the trip is downloaded.
 */
function Timeline({
  step,
  canDelete,
  onStep,
}: {
  step: 1 | 2
  canDelete: boolean
  onStep: (n: 1 | 2) => void
}) {
  return (
    <nav aria-label="Steps">
      <ol className="relative grid grid-cols-2">
        <span
          className={`absolute left-1/4 right-1/4 top-[21px] h-0.5 ${step === 2 ? 'bg-royal' : 'bg-rule'}`}
          aria-hidden="true"
        />
        {STEPS.map((title, i) => {
          const n = (i + 1) as 1 | 2
          const done = n < step
          return (
            <li key={title} className="relative flex flex-col items-center gap-1.5 text-center">
              <button
                type="button"
                onClick={() => onStep(n)}
                disabled={n === 2 && !canDelete}
                aria-current={n === step ? 'step' : undefined}
                aria-label={`Step ${n}: ${title}`}
                className={circle(n === step, done)}
              >
                {done ? <Check className="h-5 w-5" aria-hidden="true" /> : n}
              </button>
              <span
                className={`text-sm font-semibold ${n === step ? 'text-royal' : done ? 'text-ink' : 'text-muted'}`}
              >
                {title}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
