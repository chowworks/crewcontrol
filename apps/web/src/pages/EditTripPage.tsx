import {
  DEFAULT_TRIP_OPTIONS,
  HIGHLIGHT_ICONS,
  MAX_TRIP_PHOTOS,
  PAYMENT_METHOD_KINDS,
  paymentPlan,
  roomPrice,
  ROOMS_PRICED_APART,
  roomsPricedApart,
  type AgreementPreview,
  type Guest,
  type HighlightIcon,
  type OrganizerTrip,
  type PaymentMethod,
  type PaymentMethodKind,
  type PublicTrip,
  type TripInput,
  type TripOptions,
  type TripReceipts,
  type TripRoom,
} from '@cc/types'
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Eye,
  Gauge,
  ImagePlus,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AccountMenu } from '@/components/AccountMenu'
import { AdminViewNote, useAdminView } from '@/components/AdminView'
import { Dialog } from '@/components/Dialog'
import { Dropdown, REMIND_OPTIONS } from '@/components/Dropdown'
import { HIGHLIGHT_ICON_LABELS } from '@/components/HighlightIcon'
import { Logo } from '@/components/Logo'
import { useToast } from '@/components/Toast'
import { PriceSimulator } from '@/components/PriceSimulator'
import { RoomsEditor, roomProblem } from '@/components/RoomsEditor'
import { TripView } from '@/components/TripView'
import { api } from '@/lib/api'
import { shrinkPhoto } from '@/lib/resize'
import { defaultSignupNote, waitlisting } from '@/lib/signups'
import { StepsFrame } from './EditTripSteps'
import { ReceiptsAddressCard } from './ForwardedReceipts'

/** The trip link's shape, as the server checks it (parseSlug). */
const LINK = /^(?=.{3,60}$)[a-z0-9]+(?:-[a-z0-9]+)*$/

const EMPTY: TripInput = {
  name: '',
  destination: '',
  startDate: '',
  endDate: '',
  organizerName: '',
  description: '',
  costPerPersonCents: 0,
  installmentCount: 1,
  paymentDueDates: [],
  paymentReminderDays: null,
  firstPaymentCents: null,
  galleryTitle: 'Photos',
  showGuestNames: false,
  paymentMethods: [],
  paymentInstructions: '',
  published: false,
  photos: [],
  highlights: [],
  keyDates: [],
  maxGuests: null,
  joinMode: 'accept_first',
  refundPolicy: 'spot_filled',
  options: DEFAULT_TRIP_OPTIONS,
}

const field =
  'w-full rounded-[10px] border border-[#5B6B80] bg-white px-3.5 py-3 text-base text-ink focus:outline-none focus:ring-2 focus:ring-royal'
const outlineButton =
  'inline-flex min-h-[44px] items-center rounded-xl border border-royal px-4 font-semibold text-royal hover:bg-royal-pale'
const iconButton = 'rounded-lg p-2.5 text-muted hover:bg-ground hover:text-ink disabled:opacity-30'

/** The editor's steps, in order; `?step=` picks one. */
const STEPS = [
  'Trip basics',
  'Sign-ups and the trip page',
  'Rooms',
  'Price and payments',
  'Customization',
]

/** What a guest would see for the trip as edited, before it is saved. */
function previewOf(
  trip: TripInput,
  slug: string,
  guests: Guest[],
  rooms: TripRoom[],
  waitlistBufferPercent: number
): PublicTrip {
  const approved = guests.filter((g) => g.status === 'approved')
  return {
    ...trip,
    slug,
    isSample: false,
    keyDates: trip.keyDates.map(({ date, label }) => ({ date, label })),
    paymentPlan: paymentPlan(
      trip.costPerPersonCents,
      trip.installmentCount,
      trip.firstPaymentCents,
      trip.paymentDueDates
    ),
    rooms: trip.options.roomChoice
      ? rooms
          .filter((r) => r.id)
          .map((r) => ({
            id: r.id!,
            name: r.name,
            beds: r.beds,
            bedTypes: r.bedTypes,
            capacity: r.capacity,
            minPeople: r.minPeople,
            spotsLeft: Math.max(0, r.capacity - guests.filter((g) => g.roomId === r.id).length),
            priceCents: roomPrice(r, trip.costPerPersonCents),
            paymentPlan: paymentPlan(
              roomPrice(r, trip.costPerPersonCents),
              trip.installmentCount,
              trip.firstPaymentCents,
              trip.paymentDueDates
            ),
          }))
      : [],
    goingCount: approved.length,
    spotsTaken: approved.length,
    waitlisting: waitlisting({ ...trip, waitlistBufferPercent }, guests),
    interestedCount: guests.filter((g) => g.status === 'interested').length,
    guestNames:
      trip.showGuestNames || trip.options.roomChoice
        ? approved.map((g) =>
            g.lastName ? `${g.firstName} ${g.lastName[0].toUpperCase()}.` : g.firstName
          )
        : null,
  }
}

/** The editable part of a loaded trip (drops id, slug, guests and updatedAt). */
function toInput(trip: OrganizerTrip): TripInput {
  const {
    id: _id,
    slug: _slug,
    guests: _guests,
    updatedAt: _updatedAt,
    waitlistBufferPercent: _buffer,
    ...input
  } = trip
  return input
}

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function EditTripPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [trip, setTrip] = useState<TripInput>(EMPTY)
  const [slug, setSlug] = useState('')
  // The trip link as typed; saved only when it differs from `slug`.
  const [link, setLink] = useState('')
  const [guests, setGuests] = useState<Guest[]>([])
  // The system's waitlist buffer, for the preview's "Join the waitlist" (a new trip uses the default until saved).
  const [buffer, setBuffer] = useState(10)
  const [loading, setLoading] = useState(Boolean(id))
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const toast = useToast()
  const [preview, setPreview] = useState(false)
  const [rooms, setRooms] = useState<TripRoom[]>([])
  // The trip's forwarded-receipts address (issue #12), saved on its own, not with the trip.
  const [receipts, setReceipts] = useState<TripReceipts | null>(null)
  const admin = useAdminView()
  // What was last loaded or saved, to tell whether anything on screen is unsaved.
  const [savedTrip, setSavedTrip] = useState(JSON.stringify(EMPTY))
  const [savedRooms, setSavedRooms] = useState('[]')
  const [params, setParams] = useSearchParams()
  const step = Math.min(STEPS.length, Math.max(1, Number(params.get('step')) || 1))
  const roomsDirty = Boolean(id) && JSON.stringify(rooms) !== savedRooms
  const dirty =
    JSON.stringify(trip) !== savedTrip || (link.trim() !== '' && link.trim() !== slug) || roomsDirty

  // Rooms with their own prices (step 3): the trip's price is the cheapest room's, so the trip page's "From $X" and
  // anything that falls back to the trip's price match a room guests can pick.
  const ownRoomPrices = trip.options.roomPricing !== 'same'
  const cheapestRoom = ownRoomPrices
    ? Math.min(...rooms.map((r) => r.priceCents ?? Infinity).filter((c) => c > 0))
    : 0
  useEffect(() => {
    if (
      Number.isFinite(cheapestRoom) &&
      cheapestRoom > 0 &&
      cheapestRoom !== trip.costPerPersonCents
    )
      setTrip((t) => ({ ...t, costPerPersonCents: cheapestRoom }))
  }, [cheapestRoom, trip.costPerPersonCents])

  // Rooms priced apart from the trip need guests to pick one (owner's decision, 2026-10-29): both switches stay on.
  const pricedApart = roomsPricedApart(rooms, trip.costPerPersonCents)
  useEffect(() => {
    if (pricedApart && !(trip.options.roomChoice && trip.options.roomRequired))
      setTrip((t) => ({ ...t, options: { ...t.options, roomChoice: true, roomRequired: true } }))
  }, [pricedApart, trip.options.roomChoice, trip.options.roomRequired])

  // The browser asks before closing or reloading the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  /** Every step change saves first, so nothing is lost between steps; a failed save keeps you on the step. */
  async function goTo(n: number) {
    if (n === step) return
    if (dirty && !(await save())) return
    show(n)
  }
  const show = (n: number) => {
    // An error belongs to the step it was raised on; "Saved" carries over to the next one.
    setMessage((m) => (m?.kind === 'error' ? null : m))
    setParams(
      (q) => {
        const next = new URLSearchParams(q)
        if (n === 1) next.delete('step')
        else next.set('step', String(n))
        return next
      },
      { replace: true }
    )
    window.scrollTo(0, 0)
  }

  useEffect(() => {
    if (!id) return
    api
      .getTrip(id, admin)
      .then((loaded) => {
        const { slug, guests } = loaded
        setTrip(toInput(loaded))
        setSavedTrip(JSON.stringify(toInput(loaded)))
        setSlug(slug)
        setLink(slug)
        setGuests(guests)
        setBuffer(loaded.waitlistBufferPercent)
        setReceipts(loaded.receipts)
      })
      .catch(() => setMessage({ kind: 'error', text: 'This trip could not be loaded.' }))
      .finally(() => setLoading(false))
    api
      .getRooms(id, admin)
      .then((r) => {
        setRooms(r)
        setSavedRooms(JSON.stringify(r))
      })
      .catch(() => setMessage({ kind: 'error', text: 'The rooms could not be loaded.' }))
  }, [id, admin])

  const set = <K extends keyof TripInput>(key: K, value: TripInput[K]) =>
    setTrip((t) => ({ ...t, [key]: value }))
  const setOption = <K extends keyof TripOptions>(key: K, value: TripOptions[K]) =>
    setTrip((t) => ({ ...t, options: { ...t.options, [key]: value } }))

  // Problems the screen can see before saving, shown beside their fields; the server checks everything again.
  const linkProblem =
    link.trim() && link.trim() !== slug && !LINK.test(link.trim().toLowerCase())
      ? 'Use 3 to 60 lowercase letters, numbers and single hyphens, like mv-2027.'
      : null

  /** Saves the trip and, when they changed, its rooms. True when everything saved. */
  async function save(): Promise<boolean> {
    const roomsBad = roomsDirty && rooms.some((r) => roomProblem(r, trip.options.roomPricing))
    const methodsBad = trip.paymentMethods.some((m) => methodProblem(m))
    const planBad =
      trip.paymentDueDates.some((d, i) => i > 0 && d < trip.paymentDueDates[i - 1]) ||
      (trip.firstPaymentCents ?? 0) > trip.costPerPersonCents
    // A problem can sit on another step than this one: open that step, where it shows beside its field.
    const problemStep = roomsBad ? 3 : methodsBad || planBad ? 4 : linkProblem ? 5 : 0
    if (problemStep) {
      show(problemStep)
      setMessage({
        kind: 'error',
        text: `Nothing saved yet. Fix the fields marked on this step (${STEPS[problemStep - 1]}).`,
      })
      return false
    }
    setSaving(true)
    setMessage(null)
    try {
      const chosen = link.trim() && link.trim() !== slug ? link.trim() : undefined
      if (id) {
        const saved = await api.updateTrip(id, trip, chosen)
        setSlug(saved.slug)
        setLink(saved.slug)
        setSavedTrip(JSON.stringify(trip))
        if (roomsDirty) {
          const savedList = await api.setRooms(id, rooms)
          setRooms(savedList)
          setSavedRooms(JSON.stringify(savedList))
          // A removed room is cleared from its guests.
          setGuests((await api.getTrip(id)).guests)
        }
        toast({
          text: trip.published ? 'Saved. Guests see the changes now.' : 'Saved as a draft.',
        })
      } else {
        const created = await api.createTrip(trip, chosen)
        // A new trip is made on its first save, and the editor carries on at the next step.
        setSavedTrip(JSON.stringify(trip))
        navigate(`/organize/${created.id}?step=${Math.min(step + 1, STEPS.length)}`, {
          replace: true,
        })
        return false
      }
      return true
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Saving failed.' })
      return false
    } finally {
      setSaving(false)
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return
    const room = MAX_TRIP_PHOTOS - trip.photos.length
    const picked = Array.from(files).slice(0, room)
    setUploading(true)
    setMessage(null)
    try {
      for (const file of picked) {
        const blob = await shrinkPhoto(file)
        const { url } = await api.uploadPhoto(blob, file.name.replace(/\.\w+$/, '') + '.jpg')
        setTrip((t) => ({ ...t, photos: [...t.photos, { url, caption: '' }] }))
      }
      if (files.length > room)
        setMessage({
          kind: 'error',
          text: `A trip can have ${MAX_TRIP_PHOTOS} photos. Extra ones were skipped.`,
        })
    } catch (err) {
      setMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : 'A photo failed to upload.',
      })
    } finally {
      setUploading(false)
    }
  }

  if (loading) return <div className="min-h-screen bg-ground" aria-busy="true" />

  const guestUrl = slug ? `${window.location.origin}/t/${slug}` : ''

  return (
    <div className="min-h-screen pb-28">
      <div className="sticky top-0 z-10 border-b border-rule bg-ground/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-2 px-4 py-3 sm:px-5">
          <Logo />
          {/* On a phone the buttons show their icons only, so the header stays on one line. */}
          <div className="flex shrink-0 items-center gap-2">
            {id && (
              <Link
                to={admin ? `/admin/trips/${id}/control` : `/organize/${id}/control`}
                onClick={(e) => {
                  if (dirty && !window.confirm('Leave without saving your changes?'))
                    e.preventDefault()
                }}
                aria-label="Control panel"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-xl border border-royal px-2.5 font-semibold text-royal sm:px-4"
              >
                <Gauge className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Control panel</span>
              </Link>
            )}
            <button
              type="button"
              onClick={() => setPreview((p) => !p)}
              aria-label={preview ? 'Edit' : 'Preview'}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-xl border border-royal px-2.5 font-semibold text-royal sm:px-4"
            >
              {preview ? (
                <Pencil className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{preview ? 'Edit' : 'Preview'}</span>
            </button>
            <AccountMenu />
          </div>
        </div>
      </div>

      {preview ? (
        <TripView trip={previewOf(trip, slug, guests, rooms, buffer)} preview />
      ) : (
        <StepsFrame
          title={admin ? 'View trip' : id ? 'Edit trip' : 'New trip'}
          steps={STEPS}
          step={step}
          onStep={goTo}
        >
          {admin && id && <AdminViewNote tripId={id} />}
          {/* An admin's look changes nothing: every field and button on the steps is disabled. */}
          <fieldset
            disabled={admin}
            className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0 [&_input:disabled]:bg-ground [&_select:disabled]:bg-ground [&_textarea:disabled]:bg-ground"
          >
            {step === 1 && (
              <>
                <Card title="The basics">
                  <Text
                    label="Trip name"
                    value={trip.name}
                    onChange={(v) => set('name', v)}
                    placeholder="MV Beach House 2027"
                  />
                  <Text
                    label="Destination"
                    value={trip.destination}
                    onChange={(v) => set('destination', v)}
                    placeholder="Martha's Vineyard, MA"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Text
                      label="Starts"
                      type="date"
                      value={trip.startDate}
                      onChange={(v) => set('startDate', v)}
                    />
                    <Text
                      label="Ends"
                      type="date"
                      value={trip.endDate}
                      onChange={(v) => set('endDate', v)}
                    />
                  </div>
                  <Text
                    label="Hosted by"
                    value={trip.organizerName}
                    onChange={(v) => set('organizerName', v)}
                    placeholder="Your first name"
                  />
                  <label className="flex flex-col gap-1.5 text-sm font-semibold">
                    About the trip
                    <textarea
                      className={`${field} min-h-[120px]`}
                      value={trip.description}
                      onChange={(e) => set('description', e.target.value)}
                      placeholder="What the trip is, in a few sentences."
                    />
                  </label>
                </Card>
                <Card title="Key dates">
                  {trip.keyDates.map((d, i) => (
                    <div
                      key={i}
                      className="flex flex-wrap items-center gap-2 border-b border-rule pb-3 last:border-0"
                    >
                      <input
                        type="date"
                        className={`${field} min-w-0 flex-[1_1_150px]`}
                        aria-label="Date"
                        value={d.date}
                        onChange={(e) =>
                          set(
                            'keyDates',
                            trip.keyDates.map((x, j) =>
                              j === i ? { ...x, date: e.target.value } : x
                            )
                          )
                        }
                      />
                      <input
                        className={`${field} min-w-0 flex-[3_1_200px]`}
                        aria-label="What happens"
                        placeholder="Final payment due"
                        value={d.label}
                        onChange={(e) =>
                          set(
                            'keyDates',
                            trip.keyDates.map((x, j) =>
                              j === i ? { ...x, label: e.target.value } : x
                            )
                          )
                        }
                      />
                      <button
                        type="button"
                        className={iconButton}
                        aria-label="Remove date"
                        onClick={() =>
                          set(
                            'keyDates',
                            trip.keyDates.filter((_, j) => j !== i)
                          )
                        }
                      >
                        <Trash2 className="h-5 w-5" aria-hidden="true" />
                      </button>
                      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-sm font-semibold text-body">
                          Email accepted guests
                        </span>
                        <Dropdown
                          label="Email accepted guests"
                          className="w-full sm:w-[220px]"
                          value={d.remindDaysBefore ?? null}
                          options={REMIND_OPTIONS}
                          onChange={(v) =>
                            set(
                              'keyDates',
                              trip.keyDates.map((x, j) => {
                                if (j !== i) return x
                                const { remindDaysBefore: _, ...rest } = x
                                return v === null ? rest : { ...rest, remindDaysBefore: v }
                              })
                            )
                          }
                        />
                      </div>
                    </div>
                  ))}
                  <AddButton
                    onClick={() => set('keyDates', [...trip.keyDates, { date: '', label: '' }])}
                  >
                    Add date
                  </AddButton>
                  <p className="text-sm text-muted">
                    Dates sort themselves when you save. A reminder goes out in the morning, by
                    email, with a link to stop them. Payment due dates go in step 4, Price and
                    payments.
                  </p>
                </Card>
              </>
            )}

            {step === 2 && (
              <>
                <Card title="Registration options">
                  <label className="flex flex-col gap-1.5 text-sm font-semibold">
                    What guests read by the sign-up button
                    <textarea
                      className={`${field} min-h-[80px]`}
                      value={
                        trip.options.signupNote ||
                        defaultSignupNote(trip.organizerName, trip.joinMode)
                      }
                      maxLength={500}
                      onChange={(e) => {
                        // Left as the default, it stays empty, so it follows the host's name and the join mode.
                        const v = e.target.value
                        const fallback = defaultSignupNote(trip.organizerName, trip.joinMode)
                        setOption('signupNote', v.trim() === fallback ? '' : v)
                      }}
                    />
                    <span className="font-normal text-muted">
                      Starts with our default. Change it to say it your way.
                    </span>
                  </label>
                  <Text
                    label="Max trip attendees"
                    type="number"
                    value={trip.maxGuests ? String(trip.maxGuests) : ''}
                    onChange={(v) =>
                      set('maxGuests', v ? Math.max(1, Math.round(Number(v))) : null)
                    }
                    placeholder="No limit"
                  />
                  <fieldset className="flex flex-col gap-2.5">
                    <legend className="mb-1 text-sm font-semibold">Who gets a spot</legend>
                    <p className="mb-1 text-sm text-muted">
                      Guests sign in and sign the trip agreement before they get a spot. You choose
                      whether they pay before or after you accept them.
                    </p>
                    {guests.some((g) => g.signedAt) && (
                      <p className="rounded-xl bg-royal-pale px-4 py-3 text-sm text-ink">
                        Guests have signed under this choice, so it can’t change now.
                      </p>
                    )}
                    {JOIN_MODES.map((m) => (
                      <label
                        key={m.value}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3.5 ${
                          trip.joinMode === m.value ? 'border-royal bg-royal-pale' : 'border-rule'
                        }`}
                      >
                        <input
                          type="radio"
                          name="joinMode"
                          checked={trip.joinMode === m.value}
                          disabled={guests.some((g) => g.signedAt)}
                          onChange={() => set('joinMode', m.value)}
                          className="mt-1 h-4 w-4 accent-royal"
                        />
                        <span className="flex flex-col gap-0.5">
                          <span className="font-semibold">{m.label}</span>
                          <span className="text-sm text-muted">{m.hint}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <fieldset className="flex flex-col gap-2.5">
                    <legend className="mb-1 text-sm font-semibold">
                      Refunds when someone drops out
                    </legend>
                    <p className="mb-1 text-sm text-muted">
                      Whatever you pick, anyone you turn down or remove gets everything back.
                    </p>
                    {guests.some((g) => g.signedAt) && (
                      <p className="rounded-xl bg-royal-pale px-4 py-3 text-sm text-ink">
                        Guests have signed under these terms, so they can’t change now.
                      </p>
                    )}
                    {REFUND_POLICIES.map((r) => (
                      <label
                        key={r.value}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3.5 ${
                          trip.refundPolicy === r.value
                            ? 'border-royal bg-royal-pale'
                            : 'border-rule'
                        }`}
                      >
                        <input
                          type="radio"
                          name="refundPolicy"
                          checked={trip.refundPolicy === r.value}
                          disabled={guests.some((g) => g.signedAt)}
                          onChange={() => set('refundPolicy', r.value)}
                          className="mt-1 h-4 w-4 accent-royal"
                        />
                        <span className="flex flex-col gap-0.5">
                          <span className="font-semibold">{r.label}</span>
                          <span className="text-sm text-muted">{r.hint}</span>
                        </span>
                      </label>
                    ))}
                    <SuggestTerms tripId={id} />
                  </fieldset>
                  <AgreementButton tripId={id} />
                </Card>
                <Card title="Who's going">
                  <Toggle
                    checked={trip.showGuestNames || trip.options.roomChoice}
                    disabled={trip.options.roomChoice}
                    onChange={(v) => set('showGuestNames', v)}
                    label="Show accepted guests' names on the trip page"
                    hint={
                      trip.options.roomChoice
                        ? 'Always on while guests choose their room, so they can see who to share with.'
                        : 'Shown as first name and last initial. People not yet accepted are never listed.'
                    }
                  />
                  <p className="text-sm text-muted">
                    {guests.filter((g) => g.status === 'approved').length} accepted ·{' '}
                    {guests.filter((g) => g.status === 'interested').length} joining
                  </p>
                </Card>
                <Card title="Photos">
                  <Text
                    label="Section title"
                    value={trip.galleryTitle}
                    onChange={(v) => set('galleryTitle', v)}
                    placeholder="The house, The resort, Where we're staying…"
                  />
                  <p className="text-sm text-muted">
                    The first photo is the cover. The section shows once there are two or more. Up
                    to {MAX_TRIP_PHOTOS} photos.
                  </p>
                  <ul className="flex flex-col gap-3">
                    {trip.photos.map((p, i) => (
                      <li key={p.url + i} className="flex flex-wrap items-center gap-3">
                        <img
                          src={p.url}
                          alt=""
                          className="h-16 w-20 shrink-0 rounded-lg bg-placeholder object-cover"
                        />
                        <input
                          className={`${field} min-w-0 flex-[1_1_180px]`}
                          aria-label={`Caption for photo ${i + 1}`}
                          value={p.caption}
                          placeholder={i === 0 ? 'Cover photo caption' : 'Caption'}
                          onChange={(e) =>
                            set(
                              'photos',
                              trip.photos.map((x, j) =>
                                j === i ? { ...x, caption: e.target.value } : x
                              )
                            )
                          }
                        />
                        <Reorder
                          index={i}
                          length={trip.photos.length}
                          name="photo"
                          onMove={(to) => set('photos', move(trip.photos, i, to))}
                          onRemove={() =>
                            set(
                              'photos',
                              trip.photos.filter((_, j) => j !== i)
                            )
                          }
                        />
                      </li>
                    ))}
                  </ul>
                  {trip.photos.length < MAX_TRIP_PHOTOS && (
                    <label className="inline-flex min-h-[44px] w-fit cursor-pointer items-center gap-2 rounded-xl border border-royal px-4 font-semibold text-royal focus-within:ring-2 focus-within:ring-royal">
                      <ImagePlus className="h-5 w-5" aria-hidden="true" />
                      {uploading ? 'Uploading…' : 'Add photos'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        className="sr-only"
                        disabled={uploading}
                        onChange={(e) => {
                          void addPhotos(e.target.files)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  )}
                </Card>
                <Card title="Highlights">
                  <p className="text-sm text-muted">
                    The cards under the description: where you stay, how you get there, the big
                    moments.
                  </p>
                  {trip.highlights.map((h, i) => {
                    const update = (patch: Partial<typeof h>) =>
                      set(
                        'highlights',
                        trip.highlights.map((x, j) => (j === i ? { ...x, ...patch } : x))
                      )
                    return (
                      <div
                        key={i}
                        className="flex flex-col gap-2 rounded-xl border border-rule p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            className={`${field} min-w-0 flex-[1_1_140px]`}
                            aria-label="Icon"
                            value={h.icon}
                            onChange={(e) => update({ icon: e.target.value as HighlightIcon })}
                          >
                            {HIGHLIGHT_ICONS.map((icon) => (
                              <option key={icon} value={icon}>
                                {HIGHLIGHT_ICON_LABELS[icon]}
                              </option>
                            ))}
                          </select>
                          <input
                            className={`${field} min-w-0 flex-[2_1_180px]`}
                            aria-label="Highlight title"
                            placeholder="Beach house"
                            value={h.title}
                            onChange={(e) => update({ title: e.target.value })}
                          />
                          <Reorder
                            index={i}
                            length={trip.highlights.length}
                            name="highlight"
                            onMove={(to) => set('highlights', move(trip.highlights, i, to))}
                            onRemove={() =>
                              set(
                                'highlights',
                                trip.highlights.filter((_, j) => j !== i)
                              )
                            }
                          />
                        </div>
                        <input
                          className={field}
                          aria-label="Highlight detail"
                          placeholder="Sleeps 10, five minutes' walk to the beach"
                          value={h.detail}
                          onChange={(e) => update({ detail: e.target.value })}
                        />
                      </div>
                    )
                  })}
                  {trip.highlights.length < 8 && (
                    <AddButton
                      onClick={() =>
                        set('highlights', [
                          ...trip.highlights,
                          { icon: 'star', title: '', detail: '' },
                        ])
                      }
                    >
                      Add highlight
                    </AddButton>
                  )}
                </Card>
              </>
            )}

            {step === 5 && (
              <>
                <Card title="Publishing">
                  <Toggle
                    checked={trip.published}
                    onChange={(v) => set('published', v)}
                    label="Published"
                    hint="Guests can open the trip page only once it is published."
                  />
                  <label className="flex flex-col gap-1.5 text-sm font-semibold">
                    Trip link
                    <span className="flex items-stretch overflow-hidden rounded-[10px] border border-[#5B6B80] bg-white focus-within:ring-2 focus-within:ring-royal">
                      <span className="flex items-center bg-ground px-3 text-base font-normal text-muted">
                        /t/
                      </span>
                      <input
                        className="min-w-0 flex-1 px-3 py-3 text-base font-normal text-ink focus:outline-none"
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        placeholder={id ? '' : 'Made from the trip name if left blank'}
                        maxLength={60}
                        autoCapitalize="none"
                        spellCheck={false}
                      />
                    </span>
                    {linkProblem ? (
                      <span className="font-semibold text-[#B42318]">{linkProblem}</span>
                    ) : (
                      <span className="font-normal text-muted">
                        Letters, numbers and hyphens, like mv-2027.
                      </span>
                    )}
                  </label>
                  {id && trip.published && link.trim() && link.trim() !== slug && (
                    <p className="rounded-xl bg-royal-pale px-4 py-3 text-sm text-ink">
                      Saving changes the link. The old one, /t/{slug}, will stop working, so share
                      the new one with your crew.
                    </p>
                  )}
                  {trip.published && guestUrl && (
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="min-w-0 flex-1 break-all text-sm text-body">
                        Guest link:{' '}
                        <a href={guestUrl} className="font-semibold text-royal">
                          {guestUrl}
                        </a>
                      </p>
                      <CopyLink url={guestUrl} />
                    </div>
                  )}
                </Card>
              </>
            )}

            {step === 3 && (
              <>
                <Card title="Room choice">
                  {pricedApart && (
                    <p className="rounded-xl bg-royal-pale px-4 py-3 text-sm text-ink">
                      {ROOMS_PRICED_APART} Room prices are set in the rooms below.
                    </p>
                  )}
                  <Toggle
                    disabled={pricedApart}
                    checked={trip.options.roomChoice}
                    onChange={(v) => {
                      // Off: everyone gets the trip's one price (owner's decision, 2026-10-29), so rooms lose theirs.
                      setTrip((t) => ({
                        ...t,
                        options: {
                          ...t.options,
                          roomChoice: v,
                          roomRequired: v,
                          roomPricing: v ? t.options.roomPricing : 'same',
                        },
                      }))
                      if (!v) setRooms((rs) => rs.map((r) => ({ ...r, priceCents: null })))
                    }}
                    label="Guests pick their room"
                    hint="Guests pick one of the rooms below when they sign up, and the trip page shows who's in each. Off: everyone pays the trip’s one price, and you place guests in rooms."
                  />
                </Card>
                {id ? (
                  <RoomsEditor
                    rooms={rooms}
                    setRooms={setRooms}
                    tripPriceCents={trip.costPerPersonCents}
                    pricing={trip.options.roomPricing}
                    onPricing={(v) => setOption('roomPricing', v)}
                    guestsPick={trip.options.roomChoice}
                  />
                ) : (
                  <NeedsTrip />
                )}
              </>
            )}

            {step === 4 && (
              <>
                {id ? (
                  <PriceSimulator
                    tripId={id}
                    rooms={rooms}
                    onRooms={setRooms}
                    roomPricing={trip.options.roomPricing}
                    guests={guests}
                    startDate={trip.startDate}
                    costCents={trip.costPerPersonCents}
                    onCost={(v) => set('costPerPersonCents', v)}
                    installments={trip.installmentCount}
                    onInstallments={(v) => set('installmentCount', v)}
                    dueDates={trip.paymentDueDates}
                    onDueDates={(v) => set('paymentDueDates', v)}
                    firstPaymentCents={trip.firstPaymentCents}
                    onFirstPayment={(v) => set('firstPaymentCents', v)}
                    depositKept={trip.refundPolicy === 'first_payment_kept'}
                    onDepositKept={(kept) =>
                      set('refundPolicy', kept ? 'first_payment_kept' : 'spot_filled')
                    }
                    depositKeptLocked={guests.some((g) => g.signedAt)}
                    reminderDays={trip.paymentReminderDays}
                    onReminderDays={(v) => set('paymentReminderDays', v)}
                  />
                ) : (
                  <NeedsTrip />
                )}
                <Card title="How to pay">
                  <PaymentMethodsEditor
                    methods={trip.paymentMethods}
                    onChange={(v) => set('paymentMethods', v)}
                  />
                  <label className="flex flex-col gap-1.5 text-sm font-semibold">
                    Anything else about paying (optional)
                    <textarea
                      className={`${field} min-h-[80px] font-normal`}
                      value={trip.paymentInstructions}
                      onChange={(e) => set('paymentInstructions', e.target.value)}
                      placeholder="Put your name and the trip code in the memo."
                    />
                  </label>
                  <span className="text-sm text-muted">
                    {trip.joinMode === 'accept_first'
                      ? 'Only guests you accepted see these. They never appear on the public trip page.'
                      : 'Only guests who signed in and signed the trip agreement see these. They never appear on the public trip page.'}
                  </span>
                </Card>
                {id && receipts && (
                  <ReceiptsAddressCard
                    tripId={id}
                    receipts={receipts}
                    suggestion={slug}
                    onSaved={setReceipts}
                  >
                    <Toggle
                      checked={trip.options.confirmReceipts}
                      onChange={(v) => setOption('confirmReceipts', v)}
                      label="Confirm guests’ receipts as they arrive"
                      hint={
                        <>
                          <strong className="text-ink">On:</strong> a receipt a guest forwards that
                          says who paid and how much is confirmed right away.
                          <br />
                          <strong className="text-ink">Off:</strong> it waits in Actions for you to
                          confirm.
                          <br />
                          Receipts you forward are always confirmed. Anyone can edit an email before
                          forwarding it, so turn this on only for a crew you trust.
                        </>
                      }
                    />
                  </ReceiptsAddressCard>
                )}
                <Card title="Vendor costs">
                  <Toggle
                    checked={trip.options.vendorCosts}
                    onChange={(v) => setOption('vendorCosts', v)}
                    label="Track what you pay vendors"
                    hint="Trip Financials adds what you pay the house, the resort or a chef, and shows what's left after costs. Only you and the trip's organizers see it."
                  />
                </Card>
              </>
            )}
          </fieldset>

          <div className="flex flex-col gap-2">
            {message && (
              <p
                role={message.kind === 'error' ? 'alert' : 'status'}
                className={`text-sm font-semibold ${
                  message.kind === 'ok' ? 'text-royal' : 'text-[#B42318]'
                }`}
              >
                {message.text}
              </p>
            )}
            <div className="flex flex-wrap justify-between gap-3">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => goTo(step - 1)}
                  disabled={saving || uploading}
                  className={outlineButton}
                >
                  Back
                </button>
              ) : (
                <span />
              )}
              {!(admin && step === STEPS.length) && (
                <button
                  type="button"
                  onClick={() => (step < STEPS.length ? goTo(step + 1) : void save())}
                  disabled={saving || uploading}
                  className="min-h-[44px] rounded-xl bg-royal px-5 font-semibold text-white hover:bg-royal-dark disabled:opacity-60"
                >
                  {saving
                    ? 'Saving…'
                    : !id
                      ? 'Create trip and continue'
                      : step === STEPS.length
                        ? 'Save'
                        : dirty
                          ? `Save and continue to ${STEPS[step]}`
                          : `Continue to ${STEPS[step]}`}
                </button>
              )}
            </div>
            {dirty && !saving && (
              <p className="text-sm text-muted">
                You have unsaved changes. They save when you change step.
              </p>
            )}
          </div>
        </StepsFrame>
      )}
    </div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-card sm:p-6">
      <h2 className="text-xl font-extrabold">{title}</h2>
      {children}
    </section>
  )
}

function Text({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-semibold">
      {label}
      <input
        className={field}
        type={type}
        value={value}
        placeholder={placeholder}
        min={type === 'number' ? 0 : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

/** What's missing from a way to pay, if anything: a fixed kind needs its handle, a custom one its name. */
function methodProblem(m: PaymentMethod): string | null {
  if (m.kind === 'custom') return m.label.trim() ? null : 'Give it a name, like “Pay in person”.'
  return m.handle.trim() ? null : 'Add where to send it.'
}

/**
 * The ways guests can pay the organizer (owner's decision, 2026-10-24): fixed kinds Travel HQ knows by name, each with
 * its handle, and free-form ones ("Pay in person"). A guest picks one when they report a payment.
 */
function PaymentMethodsEditor({
  methods,
  onChange,
}: {
  methods: PaymentMethod[]
  onChange: (methods: PaymentMethod[]) => void
}) {
  const put = (i: number, m: PaymentMethod) => onChange(methods.map((x, j) => (j === i ? m : x)))
  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-semibold">Ways guests can pay you</span>
      {methods.length === 0 && (
        <p className="text-sm text-muted">
          Add each way you take money. Guests pick one when they tell you they’ve paid.
        </p>
      )}
      {methods.map((m, i) => {
        const kind = PAYMENT_METHOD_KINDS.find((k) => k.kind === m.kind)!
        const problem = methodProblem(m)
        return (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-rule p-3">
            <div className="flex flex-wrap gap-2">
              <select
                className={`${field} min-w-[150px] flex-1`}
                value={m.kind}
                aria-label="Way to pay"
                onChange={(e) =>
                  put(i, { ...m, kind: e.target.value as PaymentMethodKind, label: '' })
                }
              >
                {PAYMENT_METHOD_KINDS.map((k) => (
                  <option key={k.kind} value={k.kind}>
                    {k.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onChange(methods.filter((_, j) => j !== i))}
                aria-label={`Remove ${kind.name}`}
                className="grid h-11 w-11 place-items-center rounded-lg border border-royal text-royal hover:bg-royal-pale"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {m.kind === 'custom' && (
              <input
                className={field}
                value={m.label}
                maxLength={40}
                aria-label="Name"
                placeholder="Name, like “Pay in person”"
                onChange={(e) => put(i, { ...m, label: e.target.value })}
              />
            )}
            <input
              className={field}
              value={m.handle}
              maxLength={120}
              aria-label={m.kind === 'custom' ? 'How to pay' : `${kind.name} handle`}
              placeholder={kind.handle}
              onChange={(e) => put(i, { ...m, handle: e.target.value })}
            />
            {problem && <span className="text-sm font-semibold text-[#B42318]">{problem}</span>}
          </div>
        )
      })}
      {methods.length < 8 && (
        <button
          type="button"
          onClick={() => onChange([...methods, { kind: 'zelle', label: '', handle: '' }])}
          className="inline-flex min-h-[44px] items-center gap-1.5 self-start rounded-xl border border-royal px-4 font-semibold text-royal hover:bg-royal-pale"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add a way to pay
        </button>
      )}
    </div>
  )
}

// The refund presets organizers pick from (owner's decision, 2026-10-26: presets only, and a way to ask for others).
// The agreement's wording for each is in apps/api/src/join/agreement.ts (refundTerms).
const REFUND_POLICIES = [
  {
    value: 'spot_filled',
    label: 'Refund only if you fill their spot',
    hint: 'If a guest drops out, they get back what the person who takes their spot pays. If nobody does, they get nothing back.',
  },
  {
    value: 'first_payment_kept',
    label: 'Keep the deposit',
    hint: 'The deposit (the first payment) isn’t refunded. Anything paid after it comes back only if you fill their spot.',
  },
] as const

/**
 * "Suggest other refund terms": organizers who need terms we don't offer say what they want, so we learn what to add
 * (owner's decision, 2026-10-26). It goes to the Travel HQ team; the Admin toolbox lists them.
 */
function SuggestTerms({ tripId }: { tripId?: string }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const problem = text.trim() ? null : 'Say what terms you need.'
  async function send(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (problem || busy) return
    setBusy(true)
    setError(null)
    try {
      await api.addRequest({ kind: 'refund_terms', tripId, text: text.trim() })
      setOpen(false)
      setText('')
      setTried(false)
      toast({ text: 'Thanks. We read every suggestion.' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t send. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center self-start rounded-xl border border-royal px-4 font-semibold text-royal hover:bg-royal-pale"
      >
        Suggest other refund terms
      </button>
      {open && (
        <Dialog title="Suggest other refund terms" onClose={() => setOpen(false)}>
          <form onSubmit={send} noValidate className="flex flex-col gap-4">
            {error && (
              <p role="alert" className="font-semibold text-[#B42318]">
                {error}
              </p>
            )}
            <p className="text-body">
              Tell us the refund terms your trip needs. We’ll use it to decide which to add.
            </p>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              The terms you need
              <textarea
                className={`${field} min-h-[120px] font-normal`}
                value={text}
                maxLength={2000}
                onChange={(e) => setText(e.target.value)}
                placeholder="For example: a full refund until 60 days before the trip."
                aria-invalid={Boolean(tried && problem)}
              />
              {tried && problem && <span className="font-semibold text-[#B42318]">{problem}</span>}
            </label>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-[44px] items-center self-start rounded-xl bg-royal px-5 font-semibold text-white hover:bg-royal-dark disabled:opacity-60"
            >
              Send suggestion
            </button>
          </form>
        </Dialog>
      )}
    </>
  )
}

// What each way of giving spots means, for the organizer choosing one (owner's decision, 2026-10-24: keep all three,
// each explained).
const JOIN_MODES = [
  {
    value: 'accept_first',
    label: 'You accept, then they pay',
    hint: 'You pick who comes. Once a guest has signed, you accept them or turn them down, and only then do they see how to pay you. Nobody sends money without a spot. Best when you want to choose your crew.',
  },
  {
    value: 'pay_first',
    label: 'They pay, then you accept',
    hint: 'Everyone who wants in signs and pays first, then you choose. You see who’s serious, but anyone you turn down after paying gets a full refund from you.',
  },
  {
    value: 'first_come',
    label: 'First to pay gets in',
    hint: 'Spots go in the order you confirm payments arrived. You don’t choose; the money does. Best for popular trips where fairness matters more than picking. Anyone who pays after the trip fills gets a full refund from you.',
  },
] as const

/**
 * The agreement guests sign, read-only: Travel HQ writes it and fills in the trip's saved facts, and organizers
 * can't edit it. A new trip has nothing saved to fill it with yet.
 */
function AgreementButton({ tripId }: { tripId?: string }) {
  const [agreement, setAgreement] = useState<AgreementPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const admin = useAdminView()
  const open = () => {
    if (!tripId) return
    setError(null)
    api
      .getAgreement(tripId, admin)
      .then(setAgreement)
      .catch(() => setError('The agreement could not be loaded.'))
  }
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={open}
        disabled={!tripId}
        className="inline-flex min-h-[44px] items-center self-start rounded-xl border border-royal px-4 font-semibold text-royal hover:bg-royal-pale disabled:opacity-50"
      >
        Preview the guest agreement
      </button>
      <span className="text-sm text-muted">
        {tripId
          ? 'Travel HQ writes it from the trip’s saved details. You can’t edit it, and guests who already signed keep the version they signed.'
          : 'Save the trip first: the agreement is filled in from its saved details.'}
      </span>
      {error && (
        <p role="alert" className="text-sm font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      {agreement && (
        <Dialog title="The guest agreement" onClose={() => setAgreement(null)}>
          <p className="mb-3 text-sm text-muted">
            As guests see it today, filled in from the saved trip.
          </p>
          <div className="whitespace-pre-line rounded-xl bg-ground p-4 text-[15px] text-body">
            {agreement.text}
          </div>
        </Dialog>
      )}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  hint: ReactNode
  disabled?: boolean
}) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? '' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 shrink-0 accent-royal"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold">{label}</span>
        <span className="text-sm text-muted">{hint}</span>
      </span>
    </label>
  )
}

function Reorder({
  index,
  length,
  name,
  onMove,
  onRemove,
}: {
  index: number
  length: number
  name: string
  onMove: (to: number) => void
  onRemove: () => void
}) {
  return (
    <div className="ml-auto flex shrink-0">
      <button
        type="button"
        className={iconButton}
        aria-label={`Move ${name} up`}
        disabled={index === 0}
        onClick={() => onMove(index - 1)}
      >
        <ArrowUp className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={iconButton}
        aria-label={`Move ${name} down`}
        disabled={index === length - 1}
        onClick={() => onMove(index + 1)}
      >
        <ArrowDown className="h-5 w-5" aria-hidden="true" />
      </button>
      <button type="button" className={iconButton} aria-label={`Remove ${name}`} onClick={onRemove}>
        <Trash2 className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  )
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[44px] w-fit items-center gap-2 rounded-xl border border-royal px-4 font-semibold text-royal"
    >
      <Plus className="h-5 w-5" aria-hidden="true" />
      {children}
    </button>
  )
}

/** Rooms and prices hang off a saved trip, so a new one is created first. */
function NeedsTrip() {
  return (
    <p className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
      Create the trip first (the Create trip button at the top), then come back to this step.
    </p>
  )
}

/** Copies the guest link, to paste into the crew's text thread; says so for a moment after. */
function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Some browsers refuse the clipboard; the link is right there to select by hand.
    }
  }
  return (
    <button type="button" onClick={copy} className={outlineButton} aria-live="polite">
      {copied ? (
        <Check className="mr-2 h-4 w-4" aria-hidden="true" />
      ) : (
        <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
      )}
      {copied ? 'Copied' : 'Copy link'}
    </button>
  )
}
