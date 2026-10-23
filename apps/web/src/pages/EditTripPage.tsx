import {
  DEFAULT_TRIP_OPTIONS,
  HIGHLIGHT_ICONS,
  MAX_TRIP_PHOTOS,
  type Guest,
  type HighlightIcon,
  type OrganizerTrip,
  type PublicTrip,
  type TripInput,
  type TripOptions,
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
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AccountMenu } from '@/components/AccountMenu'
import { HIGHLIGHT_ICON_LABELS } from '@/components/HighlightIcon'
import { Logo } from '@/components/Logo'
import { PriceSimulator } from '@/components/PriceSimulator'
import { RoomsEditor, roomProblem } from '@/components/RoomsEditor'
import { TripView } from '@/components/TripView'
import { api } from '@/lib/api'
import { shrinkPhoto } from '@/lib/resize'
import { defaultSignupNote } from '@/lib/signups'
import { StepsFrame } from './EditTripSteps'

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
  galleryTitle: 'Photos',
  showGuestNames: false,
  paymentInstructions: '',
  published: false,
  photos: [],
  highlights: [],
  keyDates: [],
  maxGuests: null,
  payFirst: false,
  refundPledge: false,
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
function previewOf(trip: TripInput, slug: string, guests: Guest[], rooms: TripRoom[]): PublicTrip {
  const approved = guests.filter((g) => g.status === 'approved')
  return {
    ...trip,
    slug,
    isSample: false,
    paymentInstructions: trip.payFirst ? trip.paymentInstructions : null,
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
          }))
      : [],
    goingCount: approved.length,
    spotsTaken: approved.length,
    interestedCount: guests.length - approved.length,
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
  const { id: _id, slug: _slug, guests: _guests, updatedAt: _updatedAt, ...input } = trip
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
  const [loading, setLoading] = useState(Boolean(id))
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [preview, setPreview] = useState(false)
  const [rooms, setRooms] = useState<TripRoom[]>([])
  // What was last loaded or saved, to tell whether anything on screen is unsaved.
  const [savedTrip, setSavedTrip] = useState(JSON.stringify(EMPTY))
  const [savedRooms, setSavedRooms] = useState('[]')
  const [params, setParams] = useSearchParams()
  const step = Math.min(STEPS.length, Math.max(1, Number(params.get('step')) || 1))
  const roomsDirty = Boolean(id) && JSON.stringify(rooms) !== savedRooms
  const dirty =
    JSON.stringify(trip) !== savedTrip || (link.trim() !== '' && link.trim() !== slug) || roomsDirty

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
      .getTrip(id)
      .then((loaded) => {
        const { slug, guests } = loaded
        setTrip(toInput(loaded))
        setSavedTrip(JSON.stringify(toInput(loaded)))
        setSlug(slug)
        setLink(slug)
        setGuests(guests)
      })
      .catch(() => setMessage({ kind: 'error', text: 'This trip could not be loaded.' }))
      .finally(() => setLoading(false))
    api
      .getRooms(id)
      .then((r) => {
        setRooms(r)
        setSavedRooms(JSON.stringify(r))
      })
      .catch(() => setMessage({ kind: 'error', text: 'The rooms could not be loaded.' }))
  }, [id])

  const set = <K extends keyof TripInput>(key: K, value: TripInput[K]) =>
    setTrip((t) => ({ ...t, [key]: value }))
  const setOption = <K extends keyof TripOptions>(key: K, value: TripOptions[K]) =>
    setTrip((t) => ({ ...t, options: { ...t.options, [key]: value } }))

  // Problems the screen can see before saving, shown beside their fields; the server checks everything again.
  const linkProblem =
    link.trim() && link.trim() !== slug && !LINK.test(link.trim().toLowerCase())
      ? 'Use 3 to 60 lowercase letters, numbers and single hyphens, like mv-2027.'
      : null
  const pledgeProblem =
    trip.payFirst && !trip.refundPledge ? 'Tick this to have guests pay before registering.' : null

  /** Saves the trip and, when they changed, its rooms. True when everything saved. */
  async function save(): Promise<boolean> {
    const roomsBad = roomsDirty && rooms.some((r) => roomProblem(r))
    // A problem can sit on another step than this one: open that step, where it shows beside its field.
    const problemStep = pledgeProblem ? 2 : roomsBad ? 3 : linkProblem ? 5 : 0
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
        setMessage({
          kind: 'ok',
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
                to={`/organize/${id}/control`}
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
        <TripView trip={previewOf(trip, slug, guests, rooms)} preview />
      ) : (
        <StepsFrame title={id ? 'Edit trip' : 'New trip'} steps={STEPS} step={step} onStep={goTo}>
          {step === 1 && (
            <>
              <Card title="How the trip works">
                <Toggle
                  checked={trip.options.roomChoice}
                  onChange={(v) =>
                    setTrip((t) => ({
                      ...t,
                      options: {
                        ...t.options,
                        roomChoice: v,
                        roomRequired: v && t.options.roomRequired,
                      },
                    }))
                  }
                  label="Guests choose their room"
                  hint="Guests pick from the trip's rooms when they sign up (you set the rooms in step 3), and the trip page shows who's going."
                />
              </Card>
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
                  <div key={i} className="flex flex-wrap items-center gap-2">
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
                  </div>
                ))}
                <AddButton
                  onClick={() => set('keyDates', [...trip.keyDates, { date: '', label: '' }])}
                >
                  Add date
                </AddButton>
                <p className="text-sm text-muted">Dates sort themselves when you save.</p>
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
                      defaultSignupNote(trip.organizerName, trip.payFirst)
                    }
                    maxLength={500}
                    onChange={(e) => {
                      // Left as the default, it stays empty, so it follows the host's name and pay to register.
                      const v = e.target.value
                      const fallback = defaultSignupNote(trip.organizerName, trip.payFirst)
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
                  onChange={(v) => set('maxGuests', v ? Math.max(1, Math.round(Number(v))) : null)}
                  placeholder="No limit"
                />
                <Toggle
                  checked={trip.payFirst}
                  onChange={(v) =>
                    setTrip((t) => ({ ...t, payFirst: v, refundPledge: v && t.refundPledge }))
                  }
                  label="Pay to register"
                  hint="Guests send the first installment before they register, and confirm it on the form. Spots go first come, first served, in the order you confirm payments arrived."
                />
                {trip.payFirst && (
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-royal-pale p-4">
                    <input
                      type="checkbox"
                      checked={trip.refundPledge}
                      onChange={(e) => set('refundPledge', e.target.checked)}
                      className="mt-1 h-5 w-5 accent-royal"
                    />
                    <span className="text-sm text-ink">
                      {pledgeProblem && (
                        <span className="block font-semibold text-[#B42318]">{pledgeProblem}</span>
                      )}
                      <strong>I&apos;ll refund anyone who pays but doesn&apos;t get a spot</strong>{' '}
                      because the trip filled up. Guests see this promise on the trip page.
                    </span>
                  </label>
                )}
                {trip.options.roomChoice && (
                  <Toggle
                    checked={trip.options.roomRequired}
                    onChange={(v) => setOption('roomRequired', v)}
                    label="Guests must pick a room"
                    hint="Without one, the sign-up form won't send. Off: guests can choose no preference."
                  />
                )}
              </Card>
              <Card title="Who's going">
                <Toggle
                  checked={trip.showGuestNames || trip.options.roomChoice}
                  disabled={trip.options.roomChoice}
                  onChange={(v) => set('showGuestNames', v)}
                  label="Show approved guests' names on the trip page"
                  hint={
                    trip.options.roomChoice
                      ? 'Always on while guests choose their room, so they can see who to share with.'
                      : 'Shown as first name and last initial. People who only registered interest are never listed.'
                  }
                />
                <p className="text-sm text-muted">
                  {guests.filter((g) => g.status === 'approved').length} approved ·{' '}
                  {guests.filter((g) => g.status === 'interested').length} interested
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
                  The first photo is the cover. The section shows once there are two or more. Up to{' '}
                  {MAX_TRIP_PHOTOS} photos.
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
                    <div key={i} className="flex flex-col gap-2 rounded-xl border border-rule p-3">
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
                    Saving changes the link. The old one, /t/{slug}, will stop working, so share the
                    new one with your crew.
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

          {step === 3 &&
            (id ? (
              <>
                {!trip.options.roomChoice && (
                  <p className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
                    Guests won&apos;t see these rooms: they set the price in step 4. To let guests
                    pick one, turn on “Guests choose their room” in step 1.
                  </p>
                )}
                <RoomsEditor rooms={rooms} setRooms={setRooms} />
              </>
            ) : (
              <NeedsTrip />
            ))}

          {step === 4 && (
            <>
              {id ? (
                <PriceSimulator
                  tripId={id}
                  rooms={rooms}
                  guests={guests}
                  startDate={trip.startDate}
                  costCents={trip.costPerPersonCents}
                  onCost={(v) => set('costPerPersonCents', v)}
                  installments={trip.installmentCount}
                  onInstallments={(v) => set('installmentCount', v)}
                />
              ) : (
                <NeedsTrip />
              )}
              <Card title="How to pay">
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  How guests pay you
                  <textarea
                    className={`${field} min-h-[80px]`}
                    value={trip.paymentInstructions}
                    onChange={(e) => set('paymentInstructions', e.target.value)}
                    placeholder="Zelle or Cash App to me. Put your name and the trip code in the memo."
                  />
                  <span className="font-normal text-muted">
                    {trip.payFirst
                      ? 'Shown on the trip page, because guests pay before they register.'
                      : 'Only approved guests see this. It never appears on the public trip page.'}
                  </span>
                </label>
              </Card>
            </>
          )}

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
  hint: string
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
