import { useUser } from '@clerk/clerk-react'
import type { JoinInput, JoinView, MyGuest, PublicTrip } from '@cc/types'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AccountMenu } from '@/components/AccountMenu'
import { Dialog } from '@/components/Dialog'
import { Logo } from '@/components/Logo'
import { RoomCard } from '@/components/RoomCard'
import { ApiError, api } from '@/lib/api'
import { dateRange, money } from '@/lib/format'
import { NotFoundPage } from './NotFoundPage'

// The join page, /t/<slug>/join, opened from "I want to join" on the trip page. A signed-in guest fills in their
// details and signs the trip agreement in one step, then sees how to pay the organizer and says when they have. After
// that the same card shows where they stand. Payment instructions reach a guest only here.

const input =
  'rounded-[10px] border border-[#5B6B80] bg-white px-3.5 py-3 text-base font-normal text-ink focus:outline-none focus:ring-2 focus:ring-royal'
const primary =
  'min-h-[52px] rounded-xl bg-royal px-5 text-[17px] font-semibold text-white hover:bg-royal-dark'
const outlined =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-royal px-4 font-semibold text-royal hover:bg-royal-pale'

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export function JoinPage() {
  const { slug = '' } = useParams()
  const [view, setView] = useState<JoinView | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .getJoin(slug)
      .then((v) => {
        setView(v)
        document.title = `Join ${v.trip.name} · CrewControl`
      })
      .catch((err: unknown) =>
        setError(
          err instanceof ApiError && err.status === 404
            ? 'not-found'
            : 'This page could not be loaded.'
        )
      )
  }, [slug])

  if (error === 'not-found')
    return (
      <NotFoundPage message="This trip doesn't exist, or the organizer hasn't published it yet." />
    )
  if (error) return <NotFoundPage message={error} />
  if (!view) return <div className="min-h-screen bg-ground" aria-busy="true" />
  const { trip, me } = view

  return (
    <div className="min-h-screen bg-ground pb-16 text-ink">
      <header className="mx-auto flex max-w-[720px] flex-wrap items-center justify-between gap-3 px-5 py-4">
        <Logo />
        <div className="flex items-center gap-3">
          <Link to={`/t/${trip.slug}`} className={`${outlined} gap-1.5`}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            The trip
          </Link>
          <AccountMenu />
        </div>
      </header>
      <main className="mx-auto flex max-w-[720px] flex-col gap-5 px-5">
        <div>
          <p className="text-sm font-semibold text-muted">Hosted by {trip.organizerName}</p>
          <h1 className="text-[clamp(28px,6vw,40px)] font-extrabold leading-tight">{trip.name}</h1>
          <p className="text-body">
            {trip.destination} · {dateRange(trip.startDate, trip.endDate)}
          </p>
          <SpotsLine trip={trip} />
        </div>
        <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-card sm:p-6">
          {me ? (
            <MyPlace trip={trip} me={me} onChange={setView} />
          ) : (
            <JoinForm view={view} onChange={setView} />
          )}
        </section>
      </main>
    </div>
  )
}

/** How many spots are left, so a guest sees the risk before paying (owner's decision, 2026-10-21). */
function SpotsLine({ trip }: { trip: PublicTrip }) {
  if (trip.maxGuests === null) return null
  const left = Math.max(0, trip.maxGuests - trip.spotsTaken)
  return (
    <p className="mt-1 text-sm font-semibold text-royal">
      {left === 0 ? 'Every spot is taken' : `${left} of ${trip.maxGuests} spots left`}
    </p>
  )
}

interface Draft {
  name: string
  phone: string
  email: string
  roomId: string
  roomNote: string
  typedName: string
  agreed: boolean
}

const sameName = (a: string, b: string) =>
  a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase()

/** Every problem with the form, by field, so they show at once beside their fields. */
export function joinProblems(d: Draft, roomRequired = false): Partial<Record<keyof Draft, string>> {
  const out: Partial<Record<keyof Draft, string>> = {}
  if (!d.name.trim()) out.name = 'Add your name.'
  if (d.phone.replace(/\D/g, '').length < 7) out.phone = 'Add a phone number we can text.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) out.email = 'Add an email address.'
  if (!d.typedName.trim()) out.typedName = 'Type your full name to sign.'
  else if (d.name.trim() && !sameName(d.typedName, d.name))
    out.typedName = 'Type your name exactly as you wrote it above.'
  if (roomRequired && !d.roomId) out.roomId = 'Pick a room.'
  if (!d.agreed) out.agreed = 'Tick this to sign.'
  return out
}

function Problem({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-[#B42318]">{children}</span>
}

/** The guest's details, the agreement and their signature, sent as one step. */
function JoinForm({ view, onChange }: { view: JoinView; onChange: (v: JoinView) => void }) {
  const { trip, agreement } = view
  const { user } = useUser()
  const [draft, setDraft] = useState<Draft>(() => ({
    name: user?.fullName ?? '',
    phone: user?.primaryPhoneNumber?.phoneNumber ?? '',
    email: user?.primaryEmailAddress?.emailAddress ?? '',
    roomId: '',
    roomNote: '',
    typedName: '',
    agreed: false,
  }))
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alertRef = useRef<HTMLParagraphElement>(null)
  const roomRequired = trip.options.roomRequired && trip.rooms.length > 0
  const problems = joinProblems(draft, roomRequired)
  // A field's problem shows once the guest has left it, and every one shows after they press Sign.
  const [left, setLeft] = useState<Partial<Record<keyof Draft, true>>>({})
  const shown = tried
    ? problems
    : Object.fromEntries(Object.entries(problems).filter(([k]) => left[k as keyof Draft]))
  const leave = (key: keyof Draft) => () => setLeft((l) => ({ ...l, [key]: true }))
  const full = trip.maxGuests !== null && trip.spotsTaken >= trip.maxGuests
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  useEffect(() => {
    if (error) alertRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [error])

  if (full)
    return (
      <>
        <h2 className="text-xl font-extrabold">This trip is full</h2>
        <p className="text-body">
          Every spot is taken. Ask {trip.organizerName} to keep you in mind if one opens up.
        </p>
      </>
    )

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setTried(true)
    if (Object.keys(problems).length > 0) return
    setBusy(true)
    setError(null)
    const body: JoinInput = {
      name: draft.name,
      phone: draft.phone,
      email: draft.email,
      roomId: draft.roomId || null,
      roomNote: draft.roomNote,
      typedName: draft.typedName,
      agreed: draft.agreed,
      agreementHash: agreement.textHash,
    }
    try {
      onChange(await api.join(trip.slug, body))
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // The trip changed under them: show the agreement as it is now, and ask for a fresh signature.
        setError(err.message)
        if (/agreement again/.test(err.message))
          api
            .getJoin(trip.slug)
            .then((v) => {
              setDraft((d) => ({ ...d, agreed: false }))
              onChange(v)
            })
            .catch(() => undefined)
      } else
        setError(
          err instanceof ApiError && err.status !== 500
            ? err.message
            : "That didn't go through. Please try again."
        )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <h2 className="text-xl font-extrabold">Join the trip</h2>
      {trip.options.signupNote.trim() && (
        <p className="whitespace-pre-line font-semibold text-ink">{trip.options.signupNote}</p>
      )}
      <p className="text-body">
        {trip.joinMode === 'accept_first'
          ? `Sign the trip agreement, and ${trip.organizerName} accepts the crew. Once you’re accepted, you pay your first installment.`
          : `Sign the trip agreement, then pay ${trip.organizerName} your first installment. ${
              trip.joinMode === 'first_come'
                ? 'Spots go first come, first served, in the order payments are confirmed.'
                : `${trip.organizerName} accepts the crew once payments arrive.`
            } If you don’t get a spot, you get a full refund.`}
      </p>
      {(error || (tried && Object.keys(problems).length > 0)) && (
        <p ref={alertRef} role="alert" className="font-semibold text-[#B42318]">
          {error ?? 'Fix the fields marked below.'}
        </p>
      )}
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Full name
        <input
          className={input}
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
          onBlur={leave('name')}
          maxLength={120}
          autoComplete="name"
        />
        {shown.name && <Problem>{shown.name}</Problem>}
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Phone
          <input
            className={input}
            value={draft.phone}
            onChange={(e) => set('phone', e.target.value)}
            onBlur={leave('phone')}
            type="tel"
            maxLength={40}
            autoComplete="tel"
            placeholder="(555) 555-0100"
          />
          {shown.phone && <Problem>{shown.phone}</Problem>}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Email
          <input
            className={input}
            value={draft.email}
            onChange={(e) => set('email', e.target.value)}
            onBlur={leave('email')}
            type="email"
            maxLength={254}
            autoComplete="email"
          />
          {shown.email && <Problem>{shown.email}</Problem>}
        </label>
      </div>
      {trip.rooms.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-semibold">Which room would you like?</legend>
          {shown.roomId && <Problem>{shown.roomId}</Problem>}
          <div className="grid gap-2.5 sm:grid-cols-2">
            {trip.rooms.map((r) => (
              <RoomCard
                key={r.id}
                room={r}
                checked={draft.roomId === r.id}
                onChange={() => set('roomId', r.id)}
              />
            ))}
            {!roomRequired && (
              <label
                className={`flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border-2 p-3 text-sm ${
                  draft.roomId === '' ? 'border-royal bg-royal-pale' : 'border-rule bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="room"
                  checked={draft.roomId === ''}
                  onChange={() => set('roomId', '')}
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
              value={draft.roomNote}
              onChange={(e) => set('roomNote', e.target.value)}
              maxLength={200}
              placeholder="Their name"
            />
          </label>
        </fieldset>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-extrabold">The trip agreement</h3>
        <div
          tabIndex={0}
          aria-label="The trip agreement"
          className="max-h-80 overflow-y-auto whitespace-pre-line rounded-xl bg-ground p-4 text-[15px] text-body focus:outline-none focus:ring-2 focus:ring-royal"
        >
          {agreement.text}
        </div>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Type your full name to sign
        <input
          className={input}
          value={draft.typedName}
          onChange={(e) => set('typedName', e.target.value)}
          onBlur={leave('typedName')}
          maxLength={120}
          autoComplete="off"
        />
        {shown.typedName && <Problem>{shown.typedName}</Problem>}
      </label>
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={draft.agreed}
          onChange={(e) => set('agreed', e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-royal"
        />
        <span>
          {shown.agreed && (
            <span className="block font-semibold text-[#B42318]">{shown.agreed}</span>
          )}
          I agree to the trip agreement above.
        </span>
      </label>
      <p className="text-sm text-muted">
        You&apos;re signing electronically. You can ask {trip.organizerName} for a paper copy
        instead.
      </p>
      <button
        type="submit"
        aria-disabled={busy}
        className={`${primary} ${busy ? 'opacity-60' : ''}`}
      >
        {busy ? 'Signing…' : 'Sign'}
      </button>
    </form>
  )
}

/** Where the guest stands, once they've signed: how to pay, then waiting, accepted or turned down. */
function MyPlace({
  trip,
  me,
  onChange,
}: {
  trip: PublicTrip
  me: MyGuest
  onChange: (v: JoinView) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const o = trip.organizerName
  const first = me.terms ? money(me.terms.firstInstallmentCents) : 'your first installment'
  // On an accept-first trip a guest pays once accepted; on the other two, before the organizer decides.
  const canPay =
    me.status !== 'declined' && (trip.joinMode !== 'accept_first' || me.status === 'approved')
  const toPay = canPay && !me.paymentSentAt && !me.paymentConfirmedAt

  const paid = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      onChange(await api.markPaid(trip.slug))
    } catch {
      setError("That didn't go through. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  const [title, line] =
    me.status === 'declined'
      ? [
          'Not this time',
          me.refundSentAt
            ? `${o} didn’t take you on this trip and sent your refund on ${day(me.refundSentAt)}.`
            : me.paymentSentAt || me.paymentConfirmedAt
              ? `${o} didn’t take you on this trip and refunds everything you sent, in full.`
              : `${o} didn’t take you on this trip.`,
        ]
      : me.status === 'approved'
        ? [
            'You’re in',
            trip.joinMode !== 'accept_first'
              ? `${o} confirmed your payment. Your spot is held.`
              : me.paymentConfirmedAt
                ? `${o} accepted you and confirmed your payment.`
                : me.paymentSentAt
                  ? `${o} accepted you. Payment sent: ${o} will confirm it arrived.`
                  : `${o} accepted you. Now pay ${o} ${first}.`,
          ]
        : trip.joinMode === 'accept_first' && !me.paymentConfirmedAt
          ? [
              'Signed. Your copy is below',
              `${o} accepts the crew next. Once you’re in, you’ll see how to pay.`,
            ]
          : me.paymentConfirmedAt
            ? me.refundSentAt
              ? ['Payment refunded', `${o} sent your money back on ${day(me.refundSentAt)}.`]
              : trip.maxGuests !== null && trip.spotsTaken >= trip.maxGuests
                ? ['The trip filled first', `${o} confirmed your payment and refunds you in full.`]
                : ['Payment confirmed', `${o} accepts the crew next. You’ll hear either way.`]
            : me.paymentSentAt
              ? ['Payment sent', `${o} will confirm it arrived.`]
              : ['Signed. Your copy is below', `Now pay ${o} ${first} to hold your spot.`]

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 role="status" className="text-xl font-extrabold">
          {title}
        </h2>
        <p className="text-body">{line}</p>
      </div>
      {error && (
        <p role="alert" className="font-semibold text-[#B42318]">
          {error}
        </p>
      )}

      {canPay && me.paymentInstructions && (
        <div className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
          <p className="text-sm font-semibold">How to pay {o}</p>
          <p className="whitespace-pre-line">{me.paymentInstructions}</p>
        </div>
      )}
      {toPay && (
        <button type="button" onClick={paid} aria-disabled={busy} className={primary}>
          {busy ? 'Sending…' : `I’ve paid ${first}`}
        </button>
      )}

      {me.terms && (
        <dl className="grid grid-cols-2 gap-3 border-t border-rule pt-4 text-sm sm:grid-cols-4">
          <Term label="Your price" value={money(me.terms.priceCents)} />
          <Term
            label="Plan"
            value={
              me.terms.installmentCount <= 1
                ? 'One payment'
                : `${me.terms.installmentCount} installments`
            }
          />
          <Term label="Left to pay" value={money(me.terms.balanceCents)} />
          <Term label="Dates" value={dateRange(me.terms.startDate, me.terms.endDate)} />
        </dl>
      )}
      {me.agreement && (
        <button type="button" onClick={() => setReading(true)} className={`${outlined} self-start`}>
          Read what you signed
        </button>
      )}
      {reading && me.agreement && (
        <Dialog title="Your signed agreement" onClose={() => setReading(false)}>
          <div className="whitespace-pre-line rounded-xl bg-ground p-4 text-[15px] text-body">
            {me.agreement.text}
          </div>
          <p className="mt-3 text-sm text-muted">
            Signed &ldquo;{me.agreement.typedName}&rdquo; on {day(me.agreement.signedAt)}. Your
            price and plan stay as above even if the trip changes.
          </p>
        </Dialog>
      )}
    </div>
  )
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  )
}
