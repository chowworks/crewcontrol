import type { PublicRoom, PublicTrip } from '@cc/types'
import { CalendarDays, MapPin } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api } from '@/lib/api'
import { defaultSignupNote } from '@/lib/signups'
import { dateRange, installmentLine, money, shortDate } from '@/lib/format'
import { Dialog } from './Dialog'
import { HighlightIcon } from './HighlightIcon'
import { Logo } from './Logo'
import { PhotoGallery } from './PhotoGallery'
import { RoomArt, sharingLine } from './RoomArt'
import { SampleTripBadge } from './SampleTripBadge'

const h2 = 'text-[26px] font-extrabold'

/** The guest-facing trip page. Also rendered as the organizer's live preview. */
export function TripView({ trip, preview = false }: { trip: PublicTrip; preview?: boolean }) {
  const cover = trip.photos[0]
  const going = `${trip.goingCount} going · ${trip.interestedCount} interested`
  const [joinOpen, setJoinOpen] = useState(false)
  // Remembered per trip in this browser, so a guest coming back from the same text sees they're on the list.
  const [joined, setJoined] = useState(() => !preview && rememberedJoin(trip.slug))
  // Kept while the dialog is closed, so a tap outside it doesn't throw away what was typed.
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const openJoin = useCallback(() => setJoinOpen(true), [])
  const closeJoin = useCallback(() => setJoinOpen(false), [])
  const markJoined = useCallback(() => {
    setJoined(true)
    rememberJoin(trip.slug)
  }, [trip.slug])
  // A pay-first trip with no spots left must not ask anyone to send money.
  const full = trip.payFirst && trip.maxGuests !== null && trip.spotsTaken >= trip.maxGuests

  return (
    <div className="min-h-screen bg-ground text-ink">
      <header className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-5 py-4">
        <Logo />
      </header>

      <section className="mx-auto max-w-[1120px] px-5">
        <div className="overflow-hidden rounded-[20px] bg-placeholder">
          <div className="relative h-56 sm:h-80">
            {trip.isSample && <SampleTripBadge className="absolute left-4 top-4 z-10" />}
            {cover && (
              <img
                src={cover.url}
                alt={cover.caption || trip.name}
                className="h-full w-full object-cover"
              />
            )}
          </div>
          <div className="flex flex-col gap-2.5 bg-ink p-7 text-white">
            <div className="flex flex-wrap gap-2 text-[13px] font-semibold">
              <span className="rounded-full bg-marigold px-2.5 py-1 text-ink">
                Hosted by {trip.organizerName}
              </span>
              <span className="rounded-full bg-white px-2.5 py-1 text-ink">{going}</span>
            </div>
            <h1 className="text-[clamp(34px,6vw,60px)] font-extrabold leading-[1.02] tracking-tight">
              {trip.name}
            </h1>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[#DCE6EC]">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-[18px] w-[18px]" aria-hidden="true" />
                {trip.destination}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-[18px] w-[18px]" aria-hidden="true" />
                {dateRange(trip.startDate, trip.endDate)}
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-[1120px] flex-row-reverse flex-wrap items-start gap-7 px-5 pb-12 pt-7">
        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4 lg:sticky lg:top-4">
          <div className="flex flex-col gap-3.5 rounded-2xl bg-white p-6 shadow-card">
            <div className="text-sm font-semibold text-muted">Cost per person</div>
            <div className="font-display text-[44px] font-extrabold leading-none">
              {money(trip.costPerPersonCents)}
            </div>
            <p className="text-[15px] text-body">
              {installmentLine(trip.costPerPersonCents, trip.installmentCount)}{' '}
              {trip.payFirst
                ? 'The first one is due when you register.'
                : 'The first one reserves your spot once you’re approved.'}
            </p>
            <p className="rounded-[10px] bg-royal-pale px-3 py-2.5 text-sm text-body">
              {trip.payFirst
                ? `First come, first served${trip.maxGuests ? ` for ${trip.maxGuests} spots` : ''}. Send your first payment, then register. If the trip fills first, ${trip.organizerName} refunds you in full.`
                : `Nothing to pay today. ${trip.organizerName} reviews who’s interested, approves the crew, then shares how to pay.`}
            </p>
          </div>
          <WantInTile trip={trip} joined={joined} full={full} onOpen={openJoin} />
        </aside>

        <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-8">
          {trip.description && (
            <section className="flex flex-col gap-2.5">
              <h2 className={h2}>The trip</h2>
              <p className="max-w-[62ch] whitespace-pre-line text-[17px] text-body">
                {trip.description}
              </p>
            </section>
          )}

          {trip.photos.length > 1 && (
            <PhotoGallery title={trip.galleryTitle} photos={trip.photos} />
          )}

          {trip.highlights.length > 0 && (
            <section className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
              {trip.highlights.map((h, i) => (
                <div key={i} className="flex flex-col gap-1.5 rounded-[14px] bg-white p-[18px]">
                  <HighlightIcon icon={h.icon} className="h-6 w-6 text-royal" />
                  <div className="font-semibold">{h.title}</div>
                  {h.detail && <div className="text-sm text-muted">{h.detail}</div>}
                </div>
              ))}
            </section>
          )}

          {trip.guestNames && trip.guestNames.length > 0 && (
            <section className="flex flex-col gap-3.5">
              <h2 className={h2}>Who&apos;s going</h2>
              <ul className="flex flex-wrap gap-2.5">
                {trip.guestNames.map((name) => (
                  <li
                    key={name}
                    className="flex items-center gap-2 rounded-full bg-white py-1.5 pl-1.5 pr-3.5"
                  >
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-royal-pale text-[13px] font-semibold text-royal"
                      aria-hidden="true"
                    >
                      {initials(name)}
                    </span>
                    <span className="text-[15px] font-medium">{name}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {trip.keyDates.length > 0 && (
            <section className="flex flex-col gap-3.5">
              <h2 className={h2}>Key dates</h2>
              <ol className="rounded-[14px] bg-white">
                {trip.keyDates.map((d, i) => (
                  <li
                    key={i}
                    className="flex gap-4 border-b border-rule px-[18px] py-4 last:border-b-0"
                  >
                    <span className="w-[84px] shrink-0 font-semibold text-royal">
                      {shortDate(d.date)}
                    </span>
                    <span>{d.label}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </main>
      </div>

      {joinOpen && (
        <JoinDialog
          trip={trip}
          preview={preview}
          draft={draft}
          setDraft={setDraft}
          onClose={closeJoin}
          onJoined={markJoined}
        />
      )}

      <footer className="mx-auto flex max-w-[1120px] flex-wrap justify-between gap-3 px-5 pb-10 text-sm text-muted">
        <span>
          Planned with <strong className="text-ink">CrewControl</strong>
        </span>
        <span className="flex gap-4">
          <Link to="/privacy" className="font-semibold hover:text-royal">
            Privacy
          </Link>
          <span>Get your trip out the group chat.</span>
        </span>
      </footer>
    </div>
  )
}

function initials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .replace('.', '')
}

const input =
  'rounded-[10px] border border-[#5B6B80] bg-white px-3.5 py-3 text-base font-normal text-ink focus:outline-none focus:ring-2 focus:ring-royal'

interface Draft {
  form: { name: string; phone: string; email: string }
  paymentSent: boolean
  roomId: string
  roomNote: string
}
const EMPTY_DRAFT: Draft = {
  form: { name: '', phone: '', email: '' },
  paymentSent: false,
  roomId: '',
  roomNote: '',
}

/** Every problem with the sign-up form, by field, so they show at once beside their fields. */
export function signupProblems(
  d: Draft,
  payFirst: boolean,
  roomRequired = false
): Partial<Record<string, string>> {
  const out: Partial<Record<string, string>> = {}
  if (!d.form.name.trim()) out.name = 'Add your name.'
  if (d.form.phone.replace(/\D/g, '').length < 7) out.phone = 'Add a phone number we can text.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.form.email.trim())) out.email = 'Add an email address.'
  if (payFirst && !d.paymentSent) out.paymentSent = 'Send your first payment, then tick this.'
  if (roomRequired && !d.roomId) out.roomId = 'Pick a room.'
  return out
}

function FieldProblem({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-[#B42318]">{children}</span>
}

const joinKey = (slug: string) => `cc-joined-${slug}`
function rememberedJoin(slug: string): boolean {
  try {
    return localStorage.getItem(joinKey(slug)) === '1'
  } catch {
    return false
  }
}
function rememberJoin(slug: string) {
  try {
    localStorage.setItem(joinKey(slug), '1')
  } catch {
    // Private windows can refuse storage; the guest just sees the form again next time.
  }
}

/** The right-hand tile that invites people in and opens the sign-up form. */
function WantInTile({
  trip,
  joined,
  full,
  onOpen,
}: {
  trip: PublicTrip
  joined: boolean
  full: boolean
  onOpen: () => void
}) {
  const spotsLeft = trip.maxGuests ? Math.max(0, trip.maxGuests - trip.spotsTaken) : null
  const faces = (trip.guestNames ?? []).slice(0, 4)
  return (
    <div className="relative overflow-hidden rounded-2xl bg-royal p-6 text-white shadow-card">
      <svg
        viewBox="0 0 200 120"
        className="pointer-events-none absolute -right-4 -top-3 h-20 w-auto opacity-90"
        aria-hidden="true"
      >
        <path
          d="M108 22H70a22 22 0 0 0-22 22v30a22 22 0 0 0 22 22h8v20l26-20h28a22 22 0 0 0 22-22v-8"
          fill="none"
          stroke="#fff"
          strokeOpacity="0.35"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <g transform="translate(112 0) scale(2.1)">
          <path d="M0 11 21 1 15 22 9.5 14.5Z" fill="#F2B33D" />
          <path d="M9.5 14.5 21 1 9 20Z" fill="#D99A22" />
        </g>
      </svg>
      <div className="relative flex flex-col gap-3">
        <h2 className="font-display text-[28px] font-extrabold leading-tight">
          {joined ? 'You’re on the list' : full ? 'This trip is full' : 'Want in?'}
        </h2>
        <p className="max-w-[22ch] whitespace-pre-line text-[15px] text-white/85">
          {joined
            ? `${trip.organizerName} has your details and will be in touch.`
            : full
              ? `Every spot is taken. Ask ${trip.organizerName} to keep you in mind if one opens up.`
              : trip.options.signupNote.trim() ||
                defaultSignupNote(trip.organizerName, trip.payFirst)}
        </p>
        {(faces.length > 0 || spotsLeft !== null) && (
          <div className="flex items-center gap-3">
            {faces.length > 0 && (
              <span className="flex">
                {faces.map((n, i) => (
                  <span
                    key={n + i}
                    className="-ml-2 grid h-9 w-9 place-items-center rounded-full border-2 border-royal bg-marigold text-xs font-bold text-ink first:ml-0"
                  >
                    {initials(n)}
                  </span>
                ))}
              </span>
            )}
            <span className="text-sm font-semibold">
              {spotsLeft !== null
                ? `${spotsLeft} of ${trip.maxGuests} spots left`
                : `${trip.goingCount} going`}
            </span>
          </div>
        )}
        {!joined && !full && (
          <button
            type="button"
            onClick={onOpen}
            className="mt-1 min-h-[50px] rounded-xl bg-marigold px-5 text-[17px] font-semibold text-ink hover:brightness-95"
          >
            Count me in
          </button>
        )}
      </div>
    </div>
  )
}

/** The sign-up form, in a dialog. On pay-first trips the guest pays first and confirms it here. */
function JoinDialog({
  trip,
  preview,
  draft,
  setDraft,
  onClose,
  onJoined,
}: {
  trip: PublicTrip
  preview: boolean
  draft: Draft
  setDraft: Dispatch<SetStateAction<Draft>>
  onClose: () => void
  onJoined: () => void
}) {
  const { form, paymentSent, roomId, roomNote } = draft
  const setPaymentSent = (v: boolean) => setDraft((d) => ({ ...d, paymentSent: v }))
  const setRoomId = (v: string) => setDraft((d) => ({ ...d, roomId: v }))
  const setRoomNote = (v: string) => setDraft((d) => ({ ...d, roomNote: v }))
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Shown beside each field once the guest has pressed the button, and kept up to date as they fix them.
  const [tried, setTried] = useState(false)
  const alertRef = useRef<HTMLParagraphElement>(null)
  const firstPayment = Math.floor(trip.costPerPersonCents / Math.max(1, trip.installmentCount))
  const set = (key: keyof Draft['form']) => (e: ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, form: { ...d.form, [key]: e.target.value } }))
  const problems = signupProblems(
    draft,
    trip.payFirst,
    trip.options.roomRequired && trip.rooms.length > 0
  )
  const shown = tried ? problems : {}

  useEffect(() => {
    if (error) alertRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [error])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || preview) return
    setTried(true)
    if (Object.keys(problems).length > 0) return
    setBusy(true)
    setError(null)
    try {
      await api.register(trip.slug, { ...form, paymentSent, roomId: roomId || null, roomNote })
      setDone(true)
      setDraft(EMPTY_DRAFT)
      onJoined()
    } catch (err) {
      setError(
        err instanceof ApiError && err.status !== 500
          ? err.message
          : "That didn't go through. Please try again."
      )
    } finally {
      setBusy(false)
    }
  }

  if (done)
    return (
      <Dialog title="You’re on the list" onClose={onClose}>
        <p role="status" className="text-body">
          {trip.payFirst
            ? `${trip.organizerName} will confirm your payment arrived. Spots go in that order, and if the trip fills first, you get a full refund.`
            : `${trip.organizerName} will review who’s interested and let you know.`}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 min-h-[48px] self-start rounded-xl bg-royal px-6 font-semibold text-white hover:bg-royal-dark"
        >
          Done
        </button>
      </Dialog>
    )

  return (
    <Dialog title={`Want in on ${trip.name}?`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {preview && (
          <p className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
            This is a preview: the form works as guests see it, but nobody is signed up.
          </p>
        )}
        {trip.options.signupNote.trim() && (
          <p className="whitespace-pre-line font-semibold text-ink">{trip.options.signupNote}</p>
        )}
        <p className="text-muted">
          {trip.payFirst
            ? `Send your first payment of ${money(firstPayment)} to ${trip.organizerName}, then register here. Spots go first come, first served, in the order ${trip.organizerName} confirms payments arrived. If the trip fills before yours is confirmed, you get a full refund.`
            : `Register interest, ${trip.organizerName} approves you, then you pay the first installment to lock in your spot.`}{' '}
          Phone and email are both required so you don&apos;t miss trip updates.
        </p>
        {trip.payFirst && trip.paymentInstructions && (
          <div className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
            <p className="text-sm font-semibold">How to pay {trip.organizerName}</p>
            <p className="whitespace-pre-line">{trip.paymentInstructions}</p>
          </div>
        )}
        {(error || (tried && Object.keys(problems).length > 0)) && (
          <p ref={alertRef} role="alert" className="font-semibold text-[#B42318]">
            {error ?? 'Fix the fields marked below.'}
          </p>
        )}
        <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Full name
            <input
              className={input}
              value={form.name}
              onChange={set('name')}
              required
              maxLength={120}
              autoComplete="name"
              placeholder="Your name"
            />
            {shown.name && <FieldProblem>{shown.name}</FieldProblem>}
          </label>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Phone
              <input
                className={input}
                value={form.phone}
                onChange={set('phone')}
                type="tel"
                required
                maxLength={40}
                autoComplete="tel"
                placeholder="(555) 555-0100"
              />
              {shown.phone && <FieldProblem>{shown.phone}</FieldProblem>}
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Email
              <input
                className={input}
                value={form.email}
                onChange={set('email')}
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                placeholder="you@example.com"
              />
              {shown.email && <FieldProblem>{shown.email}</FieldProblem>}
            </label>
          </div>
          {trip.rooms.length > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-sm font-semibold">Which room would you like?</legend>
              {shown.roomId && <FieldProblem>{shown.roomId}</FieldProblem>}
              <div className="grid gap-2.5 sm:grid-cols-2">
                {trip.rooms.map((r) => (
                  <RoomCard
                    key={r.id}
                    room={r}
                    checked={roomId === r.id}
                    onChange={() => setRoomId(r.id)}
                  />
                ))}
                {!trip.options.roomRequired && (
                  <label
                    className={`flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border-2 p-3 text-sm ${
                      roomId === '' ? 'border-royal bg-royal-pale' : 'border-rule bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="room"
                      checked={roomId === ''}
                      onChange={() => setRoomId('')}
                      className="h-4 w-4 accent-royal"
                    />
                    <span>
                      <span className="block font-semibold text-ink">No preference</span>
                      <span className="text-muted">{trip.organizerName} will place you.</span>
                    </span>
                  </label>
                )}
              </div>
              <label className="mt-1 flex flex-col gap-1.5 text-sm font-semibold">
                Anyone you&apos;d like to share with? (optional)
                <input
                  className={input}
                  value={roomNote}
                  onChange={(e) => setRoomNote(e.target.value)}
                  maxLength={200}
                  placeholder="Their name"
                />
              </label>
            </fieldset>
          )}
          {trip.payFirst && (
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={paymentSent}
                onChange={(e) => setPaymentSent(e.target.checked)}
                className="mt-0.5 h-5 w-5 accent-royal"
              />
              <span>
                {shown.paymentSent && (
                  <span className="block font-semibold text-[#B42318]">{shown.paymentSent}</span>
                )}
                I&apos;ve sent my first payment of <strong>{money(firstPayment)}</strong> to{' '}
                {trip.organizerName}.
              </span>
            </label>
          )}
          <button
            type="submit"
            aria-disabled={busy || preview}
            className={`min-h-[52px] rounded-xl bg-royal px-5 text-[17px] font-semibold text-white hover:bg-royal-dark ${
              busy || preview ? 'opacity-60' : ''
            }`}
          >
            {busy ? 'Sending…' : 'Count me in'}
          </button>
        </form>
      </div>
    </Dialog>
  )
}

/** A room as a card with a picture of its beds, who shares, and what happens with fewer people. */
function RoomCard({
  room,
  checked,
  onChange,
}: {
  room: PublicRoom
  checked: boolean
  onChange: () => void
}) {
  const full = room.spotsLeft === 0
  return (
    <label
      className={`flex flex-col gap-2 rounded-xl border-2 p-3 text-sm ${
        full
          ? 'cursor-not-allowed border-rule opacity-50'
          : checked
            ? 'cursor-pointer border-royal bg-royal-pale'
            : 'cursor-pointer border-rule bg-white'
      }`}
    >
      <RoomArt beds={room.bedTypes} className="h-16 w-full" />
      <span className="flex items-start gap-2.5">
        <input
          type="radio"
          name="room"
          checked={checked}
          onChange={onChange}
          disabled={full}
          className="mt-1 h-4 w-4 accent-royal"
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold text-ink">{room.name}</span>
          <span className="text-muted">{sharingLine(room)}</span>
          <span className="font-semibold text-royal">
            {full
              ? 'Full'
              : `${room.spotsLeft} of ${room.capacity} ${room.capacity === 1 ? 'place' : 'places'} left`}
          </span>
        </span>
      </span>
    </label>
  )
}
