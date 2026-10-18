import {
  HIGHLIGHT_ICONS,
  MAX_TRIP_PHOTOS,
  type Guest,
  type HighlightIcon,
  type OrganizerTrip,
  type PublicTrip,
  type TripInput,
} from '@cc/types'
import { ArrowDown, ArrowLeft, ArrowUp, Eye, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { HIGHLIGHT_ICON_LABELS } from '@/components/HighlightIcon'
import { PrototypeBanner } from '@/components/PrototypeBanner'
import { TripView } from '@/components/TripView'
import { api } from '@/lib/api'
import { shrinkPhoto } from '@/lib/resize'

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
}

const field =
  'w-full rounded-[10px] border border-[#5B6B80] bg-white px-3.5 py-3 text-base text-ink focus:outline-none focus:ring-2 focus:ring-royal'
const iconButton = 'rounded-lg p-2.5 text-muted hover:bg-ground hover:text-ink disabled:opacity-30'

/** What a guest would see for the trip as edited, before it is saved. */
function previewOf(trip: TripInput, slug: string, guests: Guest[]): PublicTrip {
  const approved = guests.filter((g) => g.status === 'approved')
  return {
    ...trip,
    slug,
    goingCount: approved.length,
    interestedCount: guests.length - approved.length,
    guestNames: trip.showGuestNames
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
  const [guests, setGuests] = useState<Guest[]>([])
  const [loading, setLoading] = useState(Boolean(id))
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    if (!id) return
    api
      .getTrip(id)
      .then((loaded) => {
        const { slug, guests } = loaded
        setTrip(toInput(loaded))
        setSlug(slug)
        setGuests(guests)
      })
      .catch(() => setMessage({ kind: 'error', text: 'This trip could not be loaded.' }))
      .finally(() => setLoading(false))
  }, [id])

  const set = <K extends keyof TripInput>(key: K, value: TripInput[K]) =>
    setTrip((t) => ({ ...t, [key]: value }))

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      if (id) {
        await api.updateTrip(id, trip)
        setMessage({
          kind: 'ok',
          text: trip.published ? 'Saved. Guests see the changes now.' : 'Saved as a draft.',
        })
      } else {
        const created = await api.createTrip(trip)
        navigate(`/organize/${created.id}`, { replace: true })
      }
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Saving failed.' })
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
      <PrototypeBanner />
      <div className="sticky top-0 z-10 border-b border-rule bg-ground/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-5 py-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 py-2 text-sm font-semibold text-royal"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Your trips
          </Link>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPreview((p) => !p)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-royal px-4 font-semibold text-royal"
            >
              {preview ? (
                <Pencil className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
              {preview ? 'Edit' : 'Preview'}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || uploading}
              className="min-h-[44px] rounded-xl bg-royal px-5 font-semibold text-white hover:bg-royal-dark disabled:opacity-60"
            >
              {saving ? 'Saving…' : id ? 'Save' : 'Create trip'}
            </button>
          </div>
        </div>
        {message && (
          <p
            role="status"
            className={`mx-auto max-w-[1120px] px-5 pb-3 text-sm font-semibold ${
              message.kind === 'ok' ? 'text-royal' : 'text-[#B42318]'
            }`}
          >
            {message.text}
          </p>
        )}
      </div>

      {preview ? (
        <TripView trip={previewOf(trip, slug, guests)} />
      ) : (
        <main className="mx-auto flex max-w-[760px] flex-col gap-6 px-5 py-8">
          <h1 className="text-3xl font-extrabold">{id ? 'Edit trip' : 'New trip'}</h1>

          <Card title="Publishing">
            <Toggle
              checked={trip.published}
              onChange={(v) => set('published', v)}
              label="Published"
              hint="Guests can open the trip page only once it is published."
            />
            {trip.published && guestUrl && (
              <p className="break-all text-sm text-body">
                Guest link:{' '}
                <a href={guestUrl} className="font-semibold text-royal">
                  {guestUrl}
                </a>
              </p>
            )}
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

          <Card title="Cost">
            <div className="grid grid-cols-2 gap-3">
              <Text
                label="Cost per person ($)"
                type="number"
                value={trip.costPerPersonCents ? String(trip.costPerPersonCents / 100) : ''}
                onChange={(v) => set('costPerPersonCents', Math.round(Number(v || 0) * 100))}
              />
              <Text
                label="Installments"
                type="number"
                value={String(trip.installmentCount)}
                onChange={(v) => set('installmentCount', Math.max(1, Math.round(Number(v || 1))))}
              />
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              How to pay
              <textarea
                className={`${field} min-h-[80px]`}
                value={trip.paymentInstructions}
                onChange={(e) => set('paymentInstructions', e.target.value)}
                placeholder="Zelle or Cash App to me. Put your name and the trip code in the memo."
              />
              <span className="font-normal text-muted">
                Only approved guests see this. It never appears on the public trip page.
              </span>
            </label>
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
                        trip.photos.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x))
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
              The cards under the description: where you stay, how you get there, the big moments.
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
                  set('highlights', [...trip.highlights, { icon: 'star', title: '', detail: '' }])
                }
              >
                Add highlight
              </AddButton>
            )}
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
                      trip.keyDates.map((x, j) => (j === i ? { ...x, date: e.target.value } : x))
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
                      trip.keyDates.map((x, j) => (j === i ? { ...x, label: e.target.value } : x))
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
            <AddButton onClick={() => set('keyDates', [...trip.keyDates, { date: '', label: '' }])}>
              Add date
            </AddButton>
            <p className="text-sm text-muted">Dates sort themselves when you save.</p>
          </Card>

          <Card title="Who's going">
            <Toggle
              checked={trip.showGuestNames}
              onChange={(v) => set('showGuestNames', v)}
              label="Show approved guests' names on the trip page"
              hint="Shown as first name and last initial. People who only registered interest are never listed."
            />
            <p className="text-sm text-muted">
              {guests.filter((g) => g.status === 'approved').length} approved ·{' '}
              {guests.filter((g) => g.status === 'interested').length} interested
            </p>
          </Card>
        </main>
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
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  hint: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 shrink-0 accent-royal"
        checked={checked}
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
