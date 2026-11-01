import { useUser } from '@clerk/clerk-react'
import {
  fillAgreementNames,
  paymentMethodLabel,
  roomsPricedApart,
  type JoinInput,
  type JoinView,
  type MyGuest,
  type PublicTrip,
} from '@cc/types'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { AccountMenu } from '@/components/AccountMenu'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { CopyText } from '@/components/CopyText'
import { Dialog } from '@/components/Dialog'
import { Logo } from '@/components/Logo'
import { RoomCard } from '@/components/RoomCard'
import { useToast } from '@/components/Toast'
import { ApiError, api } from '@/lib/api'
import { dateRange, money, shortDate } from '@/lib/format'
import { owed, paymentStatus, shown, totalDueCents } from '@/lib/payments'
import { ReportPayment } from './ReportPayment'
import { adjustmentAmount } from './AdjustBalance'
import { PaidBar, TravelersCard } from './TravelersCard'
import { NotFoundPage } from './NotFoundPage'

// The join page, /t/<slug>/join, opened from "I want to join" on the trip page. A signed-in guest fills in their
// details and signs the trip agreement in one step, then sees how to pay the organizer and reports each payment they
// send. After that the same card shows where they stand and their payments. Payment instructions reach a guest only here.
// Someone can also sign up travelers they look after (a child, a roommate; issue #11): they sign for each one, and pay
// for any of them in one payment. Those travelers get a card of their own below.

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
  const [joinAnyway, setJoinAnyway] = useState(false)

  useEffect(() => {
    api
      .getJoin(slug)
      .then((v) => {
        setView(v)
        document.title = `Join ${v.trip.name} · Travel HQ`
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
  const { trip, me, managed } = view
  // Someone on the trip has it all on the trip page (owner's decision, 2026-10-29); this page is for signing up.
  if (hasJoined(view) && !view.claimable) return <Navigate to={`/t/${trip.slug}`} replace />
  // A save the date takes "I'm interested" on the trip page, never a signature (issue #47).
  if (trip.saveTheDate && !view.claimable) return <Navigate to={`/t/${trip.slug}`} replace />

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
        {(me || managed.length === 0) && (
          <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-card sm:p-6">
            {view.claimable && !joinAnyway ? (
              // Someone signed them up; on a place of their own turned down (joined by mistake), there's no "Not me".
              <Claim
                view={view}
                onChange={setView}
                onNotMe={me ? undefined : () => setJoinAnyway(true)}
              />
            ) : me ? (
              <MyPlace view={view} me={me} onChange={setView} />
            ) : (
              <JoinForm view={view} onChange={setView} />
            )}
          </section>
        )}
        {managed.length > 0 && <Travelers view={view} onChange={setView} />}
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
  /** Travel HQ's Terms of Use, asked only of someone who hasn't accepted the current version. */
  termsAccepted: boolean
}

const sameName = (a: string, b: string) =>
  a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * Every problem with the form, by field, so they show at once beside their fields. `behalf`: signing up someone else,
 * so the name, phone and email are theirs and the signature is the signer's own name.
 */
export function joinProblems(
  d: Draft,
  roomRequired = false,
  termsAsked = false,
  readAgreement = true,
  behalf = false
): Partial<Record<keyof Draft, string>> {
  const out: Partial<Record<keyof Draft, string>> = {}
  if (!d.name.trim()) out.name = behalf ? 'Add their name.' : 'Add your name.'
  if (d.phone.replace(/\D/g, '').length < 7) out.phone = 'Add a phone number we can text.'
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(d.email.trim())) out.email = 'Add an email address.'
  if (!d.typedName.trim())
    out.typedName = behalf
      ? 'Type your own full name to sign for them.'
      : 'Type your full name to sign.'
  else if (behalf && sameName(d.typedName, d.name))
    out.typedName = 'Type your own name, not theirs.'
  else if (!behalf && d.name.trim() && !sameName(d.typedName, d.name))
    out.typedName = 'Type your name exactly as you wrote it above.'
  if (roomRequired && !d.roomId) out.roomId = 'Pick a room.'
  if (!readAgreement) out.agreed = 'Scroll to the end of the trip agreement first.'
  else if (!d.agreed) out.agreed = 'Tick this to sign.'
  if (termsAsked && !d.termsAccepted) out.termsAccepted = 'Tick this to join.'
  return out
}

/**
 * Someone signed the caller up for this trip with an email the caller has verified (issue #11): "That's me" takes
 * over that place, with the agreement signed for them. Anyone else joins for themselves.
 */
function Claim({
  view,
  onChange,
  onNotMe,
}: {
  view: JoinView
  onChange: (v: JoinView) => void
  onNotMe?: () => void
}) {
  const [notMe, setNotMe] = useState(false)
  const { trip, termsOfUse } = view
  const termsAsked = !termsOfUse.accepted
  const [terms, setTerms] = useState(false)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const toast = useToast()
  const signer = view.claimable?.signedBy || 'Someone'

  async function take() {
    setTried(true)
    if (termsAsked && !terms) return
    setBusy(true)
    setError('')
    try {
      onChange(
        await api.claim(
          trip.slug,
          termsAsked ? { termsVersion: termsOfUse.version, termsAgreed: true } : {}
        )
      )
      toast({ text: 'This place is yours now.' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      <div>
        <h2 className="text-xl font-extrabold">{signer} signed you up for this trip</h2>
        <p className="text-body">
          Is this you? Say so to see your place, your payments and how to pay. {signer} signed the
          trip agreement for you, and can still see your place and pay for you.
        </p>
      </div>
      {termsAsked && (
        <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-royal"
          />
          <span>
            {tried && !terms && <Problem>Tick this to take your place.</Problem>}
            <span className="block">
              I agree to Travel HQ&apos;s{' '}
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-royal underline"
              >
                Terms of Use
              </a>
              .
            </span>
          </span>
        </label>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="button" className={primary} onClick={take} disabled={busy}>
          That’s me
        </button>
        {onNotMe && (
          <button type="button" className={outlined} onClick={() => setNotMe(true)}>
            Not me, join myself
          </button>
        )}
      </div>
      {notMe && onNotMe && (
        <ConfirmDialog
          title="Join as someone new?"
          confirmLabel="Join as someone new"
          onConfirm={onNotMe}
          onCancel={() => setNotMe(false)}
        >
          <p className="text-body">
            {signer} signed up a traveler with your email. If that’s you, choose That’s me instead:
            joining as someone new gives you a second place on the trip, and only{' '}
            {trip.organizerName} can undo that.
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}

function Problem({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-[#B42318]">{children}</span>
}

/**
 * The guest's details, the agreement and their signature, sent as one step. The first time, it asks who they're
 * signing up: themselves, or someone they look after (issue #11). `fixed` skips that question: adding another traveler,
 * or joining themselves after signing others up.
 */
function JoinForm({
  view,
  onChange,
  onRefresh,
  fixed,
}: {
  view: JoinView
  /** They joined, or signed someone up. */
  onChange: (v: JoinView) => void
  /** The page reloaded after the server refused (the trip changed): the form stays open with its error. */
  onRefresh?: (v: JoinView) => void
  fixed?: 'self' | 'behalf'
}) {
  const { trip, termsOfUse } = view
  const termsAsked = !termsOfUse.accepted
  const { user } = useUser()
  const toast = useToast()
  const [who, setWho] = useState<'self' | 'behalf'>(fixed ?? 'self')
  const behalf = who === 'behalf'
  // Someone they sign up waits where they wait (owner's decision, 2026-10-28); the database decides (guest_waitlist).
  const meWaiting = Boolean(
    view.me && view.me.status === 'interested' && view.me.waitlistedAt && !view.me.offeredAt
  )
  const full = trip.maxGuests !== null && trip.spotsTaken >= trip.maxGuests
  const theyWait = full || (view.me ? meWaiting : trip.waitlisting)
  const mine = () => ({
    name: user?.fullName ?? '',
    phone: user?.primaryPhoneNumber?.phoneNumber ?? '',
    email: user?.primaryEmailAddress?.emailAddress ?? '',
  })
  const theirs = { name: '', phone: '', email: '' }
  const [draft, setDraft] = useState<Draft>(() => ({
    ...(behalf ? theirs : mine()),
    roomId: '',
    roomNote: '',
    typedName: '',
    agreed: false,
    termsAccepted: false,
  }))
  // Someone who said "I'm interested" (issue #47) starts with the name and phone they gave then.
  useEffect(() => {
    if (behalf) return
    let live = true
    api
      .getMyInterest(trip.slug)
      .then((i) => {
        if (!live || !i.onList) return
        setDraft((d) => ({ ...d, name: d.name || i.name, phone: d.phone || i.phone }))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [trip.slug, behalf])
  // The room they pick sets the price they sign, when it's priced apart from the trip (issue #30).
  const agreementFor = (v: JoinView, roomId: string) => {
    const priced = v.roomAgreements.find((r) => r.roomId === roomId) ?? v
    return behalf ? priced.agreementOnBehalf : priced.agreement
  }
  const agreement = agreementFor(view, draft.roomId)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alertRef = useRef<HTMLParagraphElement>(null)
  // The agreement is read to its end before signing; a changed agreement is read again. The box stays tickable (a
  // screen reader can read it without scrolling it); Sign says what's missing.
  const agreementRef = useRef<HTMLDivElement>(null)
  const [readTo, setReadTo] = useState<string | null>(null)
  const readAll = readTo === agreement.textHash
  const checkRead = () => {
    const el = agreementRef.current
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setReadTo(agreement.textHash)
  }
  const pricedApart = roomsPricedApart(trip.rooms, trip.costPerPersonCents)
  const roomRequired = trip.rooms.length > 0 && (trip.options.roomRequired || pricedApart)
  const problems = joinProblems(draft, roomRequired, termsAsked, readAll, behalf)
  // A field's problem shows once the guest has left it, and every one shows after they press Sign.
  const [left, setLeft] = useState<Partial<Record<keyof Draft, true>>>({})
  const shown = tried
    ? problems
    : Object.fromEntries(Object.entries(problems).filter(([k]) => left[k as keyof Draft]))
  const leave = (key: keyof Draft) => () => setLeft((l) => ({ ...l, [key]: true }))
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))
  // Switching who it's for starts the details over: the signer's own, or blank for someone else's.
  const choose = (next: 'self' | 'behalf') => {
    if (next === who) return
    setWho(next)
    setDraft((d) => ({
      ...d,
      ...(next === 'behalf' ? theirs : mine()),
      roomId: '',
      roomNote: '',
      typedName: '',
      agreed: false,
    }))
    setLeft({})
    setTried(false)
  }

  // The end already in view (short text, a bigger window, fonts that loaded late): nothing more to read.
  useEffect(() => {
    const el = agreementRef.current
    if (!el) return
    checkRead()
    const watch = new ResizeObserver(checkRead)
    watch.observe(el)
    return () => watch.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreement.textHash])

  useEffect(() => {
    if (error) alertRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [error])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setTried(true)
    if (Object.keys(problems).length > 0) {
      if (!readAll) agreementRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }
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
      ...(termsAsked ? { termsVersion: termsOfUse.version, termsAgreed: draft.termsAccepted } : {}),
      ...(behalf ? { onBehalf: true } : {}),
    }
    try {
      onChange(await api.join(trip.slug, body))
      if (behalf) toast({ text: `${draft.name.trim().split(/\s+/)[0]} is signed up.` })
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // The trip or the Terms changed under them: show them as they are now, and untick whichever changed, so
        // nothing is signed or accepted unseen.
        setError(err.message)
        api
          .getJoin(trip.slug)
          .then((v) => {
            setDraft((d) => ({
              ...d,
              agreed: agreementFor(v, d.roomId).textHash === agreement.textHash && d.agreed,
              termsAccepted:
                v.termsOfUse.version === termsOfUse.version && termsAsked && d.termsAccepted,
            }))
            ;(onRefresh ?? onChange)(v)
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
      {!fixed && (
        <h2 className="text-xl font-extrabold">
          {behalf ? 'Sign someone up' : trip.waitlisting ? 'Join the waitlist' : 'Join the trip'}
        </h2>
      )}
      {!fixed && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-semibold">Who are you signing up?</legend>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {(
              [
                ['self', 'Me', 'I’m going on this trip.'],
                [
                  'behalf',
                  'Someone I look after',
                  'A child or a roommate. You sign and pay for them, and can add more after.',
                ],
              ] as const
            ).map(([key, title, line]) => (
              <label
                key={key}
                className={`flex min-h-[56px] cursor-pointer items-start gap-3 rounded-xl border-2 p-3 text-sm ${
                  who === key ? 'border-royal bg-royal-pale' : 'border-rule bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="who"
                  checked={who === key}
                  onChange={() => choose(key)}
                  className="mt-0.5 h-4 w-4 accent-royal"
                />
                <span>
                  <span className="block font-semibold text-ink">{title}</span>
                  <span className="text-muted">{line}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {trip.waitlisting && !behalf && (
        <p className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
          Every spot is spoken for. Sign to join the waitlist: {trip.organizerName} texts you if a
          spot opens, and you pay nothing until then.
        </p>
      )}
      {trip.options.signupNote.trim() && (
        <p className="whitespace-pre-line font-semibold text-ink">{trip.options.signupNote}</p>
      )}
      {behalf && theyWait && (
        <p className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
          {meWaiting
            ? 'You’re on the waitlist, so they join it with you.'
            : 'Every spot is spoken for, so they join the waitlist.'}{' '}
          {trip.organizerName} texts you if a spot opens, and you pay nothing for them until then.
        </p>
      )}
      {behalf && (
        <p className="text-body">
          Sign the trip agreement for them. They get a spot of their own, and you can pay for them.
        </p>
      )}
      {/* On the waitlist there's nothing to pay yet, so the usual "sign, then pay" line would mislead. */}
      {!trip.waitlisting && !behalf && (
        <p className="text-body">
          {trip.joinMode === 'accept_first'
            ? `Sign the trip agreement, and ${trip.organizerName} accepts the crew. Once you’re accepted, you make your first payment.`
            : `Sign the trip agreement, then make your first payment to ${trip.organizerName}. ${
                trip.joinMode === 'first_come'
                  ? 'Spots go first come, first served, in the order payments are confirmed.'
                  : `${trip.organizerName} accepts the crew once payments arrive.`
              } If you don’t get a spot, ${trip.organizerName} refunds you in full.`}
        </p>
      )}
      {(error || (tried && Object.keys(problems).length > 0)) && (
        <p ref={alertRef} role="alert" className="font-semibold text-[#B42318]">
          {error ?? 'Fix the fields marked below.'}
        </p>
      )}
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        {behalf ? 'Their full name' : 'Full name'}
        <input
          className={input}
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
          onBlur={leave('name')}
          maxLength={120}
          autoComplete={behalf ? 'off' : 'name'}
        />
        {shown.name && <Problem>{shown.name}</Problem>}
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {behalf ? 'Their phone' : 'Phone'}
          <input
            className={input}
            value={draft.phone}
            onChange={(e) => set('phone', e.target.value)}
            onBlur={leave('phone')}
            type="tel"
            maxLength={40}
            autoComplete={behalf ? 'off' : 'tel'}
            placeholder="(555) 555-0100"
          />
          {shown.phone && <Problem>{shown.phone}</Problem>}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {behalf ? 'Their email' : 'Email'}
          <input
            className={input}
            value={draft.email}
            onChange={(e) => set('email', e.target.value)}
            onBlur={leave('email')}
            type="email"
            maxLength={254}
            autoComplete={behalf ? 'off' : 'email'}
          />
          {shown.email && <Problem>{shown.email}</Problem>}
        </label>
        {behalf && (
          <p className="-mt-2 text-sm text-muted sm:col-span-2">
            Theirs, or yours if they don&apos;t have one. With their own email they can sign in and
            see their trip.
          </p>
        )}
      </div>
      {trip.rooms.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-semibold">
            {behalf ? 'Which room would they like?' : 'Which room would you like?'}
          </legend>
          {shown.roomId && <Problem>{shown.roomId}</Problem>}
          <div className="grid gap-2.5 sm:grid-cols-2">
            {trip.rooms.map((r) => (
              <RoomCard
                key={r.id}
                room={r}
                checked={draft.roomId === r.id}
                price={pricedApart ? r.priceCents : undefined}
                onChange={() =>
                  // Another price is another agreement: it's agreed to again.
                  setDraft((d) => ({
                    ...d,
                    roomId: r.id,
                    agreed: d.agreed && agreementFor(view, r.id).textHash === agreement.textHash,
                  }))
                }
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
                  <span className="text-muted">
                    {trip.organizerName} will place {behalf ? 'them' : 'you'}.
                  </span>
                </span>
              </label>
            )}
          </div>
          <label className="mt-1 flex flex-col gap-1.5 text-sm font-semibold">
            {behalf
              ? 'Anyone they’d like to share with? (optional)'
              : 'Anyone you’d like to share with? (optional)'}
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
          ref={agreementRef}
          onScroll={checkRead}
          className="max-h-80 overflow-y-auto whitespace-pre-line rounded-xl bg-ground p-4 text-[15px] text-body focus:outline-none focus:ring-2 focus:ring-royal"
        >
          {behalf
            ? fillAgreementNames(agreement.text, draft.typedName, draft.name)
            : agreement.text}
        </div>
        <p
          id="agreement-read"
          role="status"
          className={`text-sm font-semibold ${readAll ? 'text-royal' : 'text-muted'}`}
        >
          {readAll
            ? '✓ You’ve read to the end of the trip agreement.'
            : '↓ Scroll to the end of the trip agreement to sign.'}
        </p>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        {behalf ? 'Type your own full name to sign for them' : 'Type your full name to sign'}
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
      <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={draft.agreed}
          aria-describedby="agreement-read"
          onChange={(e) => set('agreed', e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-royal"
        />
        <span>
          {shown.agreed && (
            <span className="block font-semibold text-[#B42318]">{shown.agreed}</span>
          )}
          {behalf
            ? 'I agree to the trip agreement above, for them.'
            : 'I agree to the trip agreement above.'}
        </span>
      </label>
      {termsAsked && (
        <div className="flex flex-col">
          <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={draft.termsAccepted}
              aria-describedby="terms-note"
              onChange={(e) => set('termsAccepted', e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-royal"
            />
            <span>
              {shown.termsAccepted && (
                <span className="block font-semibold text-[#B42318]">{shown.termsAccepted}</span>
              )}
              I agree to Travel HQ&apos;s Terms of Use and Privacy.
              <span id="terms-note" className="mt-0.5 block text-muted">
                These are between you and Travel HQ, the app. The trip agreement is between you and{' '}
                {trip.organizerName}.
              </span>
            </span>
          </label>
          {/* On their own line, away from the box, so a thumb meant for a link doesn't tick it. */}
          <div className="flex gap-4 pl-8 text-sm">
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center font-semibold text-royal underline"
            >
              Read the Terms of Use
            </a>
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center font-semibold text-royal underline"
            >
              Privacy
            </a>
          </div>
        </div>
      )}
      <p className="text-sm text-muted">
        You&apos;re signing electronically. You can ask {trip.organizerName} for a paper copy
        instead.
      </p>
      <button
        type="submit"
        aria-disabled={busy}
        className={`${primary} ${busy ? 'opacity-60' : ''}`}
      >
        {busy ? 'Signing…' : behalf ? 'Sign them up' : 'Sign'}
      </button>
    </form>
  )
}

/**
 * Whether someone on the trip can be paid for now. On an accept-first trip a guest pays once accepted; on the other
 * two, before the organizer decides. A guest still waiting on a trip that filled has nothing to pay for (they're owed
 * back what they sent), and nor has one on the waitlist with no spot offered yet.
 */
function payable(trip: PublicTrip, g: MyGuest): boolean {
  const full = trip.maxGuests !== null && trip.spotsTaken >= trip.maxGuests
  const waiting = g.status === 'interested' && Boolean(g.waitlistedAt) && !g.offeredAt
  return (
    g.status !== 'declined' &&
    !g.refundSentAt &&
    !waiting &&
    !(g.status === 'interested' && full) &&
    (trip.joinMode !== 'accept_first' || g.status === 'approved')
  )
}

/** Everyone the signed-in person can pay for now, with something left to pay: themselves first. */
export const payees = (view: JoinView) =>
  [view.me, ...view.managed].filter(
    (g): g is MyGuest =>
      g !== null && g.terms !== null && payable(view.trip, g) && owed(g.terms).left > 0
  )

/** Whether the caller is on the trip: their own place, not turned down, or travelers they signed up. */
export const hasJoined = (view: JoinView) =>
  (view.me !== null && view.me.status !== 'declined') || view.managed.length > 0

/** The trip page's column for someone on the trip: their place, then the travelers they look after. */
export function MyTripPanel({
  view,
  onChange,
}: {
  view: JoinView
  onChange: (v: JoinView) => void
}) {
  const { me } = view
  return (
    <>
      {me && me.status !== 'declined' && (
        <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-card sm:p-6">
          <MyPlace view={view} me={me} onChange={onChange} />
        </section>
      )}
      {view.managed.length > 0 && <Travelers view={view} onChange={onChange} />}
    </>
  )
}

/** Where the guest stands, once they've signed: how to pay and their payments, then waiting, accepted or turned down. */
function MyPlace({
  view,
  me,
  onChange,
}: {
  view: JoinView
  me: MyGuest
  onChange: (v: JoinView) => void
}) {
  const { trip } = view
  const [reading, setReading] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [adding, setAdding] = useState(false)
  const toast = useToast()
  // A forward is matched by the email they sign in with, so they're told which one to send it from.
  const signInEmail = useUser().user?.primaryEmailAddress?.emailAddress
  const o = trip.organizerName
  const full = trip.maxGuests !== null && trip.spotsTaken >= trip.maxGuests
  // On the waitlist with no spot offered yet: nothing to pay.
  const waiting = me.status === 'interested' && Boolean(me.waitlistedAt) && !me.offeredAt
  const canPay = payable(trip, me)
  const { left, dueNow } = me.terms ? owed(me.terms) : { left: 0, dueNow: 0 }
  const datedPlan = Boolean(
    me.terms && me.terms.schedule.length > 1 && me.terms.schedule.every((p) => p.dueOn)
  )
  const first = me.terms ? money(me.terms.firstInstallmentCents) : 'your first installment'
  const paidCents = me.terms?.paidCents ?? 0
  const reported = me.payments.some((p) => p.status === 'reported')
  const sentAny = paidCents > 0 || reported

  const [title, line] =
    me.status === 'declined'
      ? [
          'Not this time',
          me.refundSentAt
            ? `${o} didn’t take you on this trip and sent your refund on ${day(me.refundSentAt)}.`
            : sentAny
              ? `${o} didn’t take you on this trip and refunds everything you sent, in full.`
              : `${o} didn’t take you on this trip.`,
        ]
      : me.status === 'approved'
        ? // Once they're in, the card is about their payments (owner's decision, 2026-10-29); a line only when they act.
          [
            'Payment details',
            trip.joinMode !== 'accept_first' || me.spotPaidAt
              ? ''
              : reported
                ? `Payment sent: ${o} will confirm it arrived.`
                : `Now pay ${o} ${dueNow ? money(dueNow) : first} to hold your spot.`,
          ]
        : waiting
          ? [
              'You’re on the waitlist',
              `${o} will text you if a spot opens. You pay nothing until then.`,
            ]
          : trip.joinMode === 'accept_first'
            ? [
                'Signed. Your copy is below',
                `${o} accepts the crew next. Once you’re in, you’ll see how to pay.`,
              ]
            : me.refundSentAt
              ? ['Payment refunded', `${o} sent your money back on ${day(me.refundSentAt)}.`]
              : me.spotPaidAt
                ? full
                  ? [
                      'The trip filled first',
                      `${o} confirmed your payment and refunds you in full.`,
                    ]
                  : ['Payment confirmed', `${o} accepts the crew next. You’ll hear either way.`]
                : reported
                  ? ['Payment sent', `${o} will confirm it arrived.`]
                  : paidCents > 0
                    ? [
                        'Part paid',
                        `${o} confirmed ${money(paidCents)}. ${money(dueNow)} more saves your spot.`,
                      ]
                    : me.offeredAt
                      ? ['A spot opened', `${o} offered you a spot. Pay ${first} to take it.`]
                      : full
                        ? [
                            'The trip filled up',
                            `Every spot is taken. ${o} will text you if one opens. Don’t send money until then.`,
                          ]
                        : ['Signed. Your copy is below', `Now pay ${o} ${first} to save your spot.`]

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 role="status" className="text-xl font-extrabold">
          {title}
        </h2>
        {line && <p className="text-body">{line}</p>}
      </div>
      {me.terms && me.status !== 'declined' && (
        <div className="flex flex-col gap-1.5">
          <PaidBar g={me} />
          <span className="text-sm text-body">
            {money(me.terms.paidCents)} of {money(totalDueCents(me.terms))} paid
            {me.terms.balanceCents > 0 && ` · ${money(me.terms.balanceCents)} left`}
            {!datedPlan &&
              me.terms.installmentCount > 1 &&
              ` · ${me.terms.installmentCount} installments`}
          </span>
        </div>
      )}

      {canPay && (me.paymentMethods.length > 0 || me.paymentInstructions) && (
        <div className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
          <p className="text-sm font-semibold">How to pay {o}</p>
          {me.paymentMethods.length > 0 && (
            <ul className="mt-1 flex flex-col">
              {me.paymentMethods.map((m, i) => (
                <li key={i}>
                  {/* The handle is what they paste into Cash App or their bank, so it copies on its own. */}
                  {m.handle.trim() ? (
                    <CopyText
                      value={m.handle.trim()}
                      label={`${paymentMethodLabel(m).split(' · ')[0]} handle`}
                    >
                      {paymentMethodLabel(m)}
                    </CopyText>
                  ) : (
                    paymentMethodLabel(m)
                  )}
                </li>
              ))}
            </ul>
          )}
          {me.paymentInstructions && (
            <p className="mt-2 whitespace-pre-line">{me.paymentInstructions}</p>
          )}
          {/* Forwarding the payment email records it for them (issue #12). */}
          {me.receiptsEmail && (
            <div className="mt-3 text-sm">
              <p>Paid? Forward the Zelle, Cash App or bank email to</p>
              <CopyText value={me.receiptsEmail} label="Receipts address">
                <span className="font-semibold">{me.receiptsEmail}</span>
              </CopyText>
              <p className="text-body">
                {signInEmail ? (
                  <>
                    Send it from <span className="break-all">{signInEmail}</span> and it’s recorded
                    for you.
                  </>
                ) : (
                  'Send it from the email you sign in with and it’s recorded for you.'
                )}
              </p>
            </div>
          )}
        </div>
      )}
      {canPay && left > 0 && me.terms && (
        // Once a payment is waiting, the main thing is done: another payment is a secondary step.
        <button
          type="button"
          onClick={() => setReporting(true)}
          className={reported ? `${outlined} self-start` : primary}
        >
          {reported ? 'Report another payment' : 'I’ve paid'}
        </button>
      )}
      {/* The plan right after "I've paid", then what was paid (owner's decision, 2026-10-29). */}
      {me.terms && datedPlan && (
        <div className="flex flex-col gap-1 text-sm">
          <p className="flex justify-between text-muted">
            <span>Your payment plan, due by</span>
            <span>Amount</span>
          </p>
          <ol className="flex flex-col">
            {me.terms.schedule.map((p, i) => {
              // Struck through once what they paid covers it and every payment before it.
              const covered =
                me.terms!.paidCents >=
                me.terms!.schedule.slice(0, i + 1).reduce((sum, x) => sum + x.amountCents, 0)
              return (
                <li
                  key={i}
                  className={`flex justify-between border-t border-rule py-1.5 ${covered ? 'text-muted line-through' : ''}`}
                >
                  <span>
                    {dateRange(p.dueOn!, p.dueOn!)}
                    {covered && <span className="sr-only"> (paid)</span>}
                  </span>
                  <span className={covered ? '' : 'font-semibold text-ink'}>
                    {money(p.amountCents)}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      )}
      {(me.payments.length > 0 || me.adjustments.length > 0) && (
        <MyPayments payments={me.payments} adjustments={me.adjustments} organizer={o} />
      )}

      {me.agreement && (
        <button type="button" onClick={() => setReading(true)} className={`${outlined} self-start`}>
          Review signed trip agreement
        </button>
      )}
      {/* Once they look after someone, the Travelers card below has this. */}
      {view.managed.length === 0 && me.status !== 'declined' && (
        <div className="flex flex-col gap-2 border-t border-rule pt-4">
          <p className="text-sm font-semibold">Signing up a child or someone you look after?</p>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={`${outlined} self-start`}
          >
            Sign someone up
          </button>
        </div>
      )}
      {adding && (
        <Dialog title="Sign someone up" onClose={() => setAdding(false)}>
          <JoinForm
            view={view}
            fixed="behalf"
            onChange={(v) => {
              setAdding(false)
              onChange(v)
            }}
            onRefresh={onChange}
          />
        </Dialog>
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
      {reporting && me.terms && (
        <ReportPayment
          view={view}
          people={payees(view)}
          onDone={(v) => {
            setReporting(false)
            onChange(v)
            toast({ text: `Payment reported to ${o}. They’ll confirm it arrived.` })
            window.dispatchEvent(new Event('cc:actions-changed'))
          }}
          onClose={() => setReporting(false)}
        />
      )}
    </div>
  )
}

/**
 * The travelers someone signed up and looks after (issue #11): where each one stands and what's paid, how to pay when
 * the signer isn't on the trip themselves, adding another while a spot is left, and joining themselves too.
 */
function Travelers({ view, onChange }: { view: JoinView; onChange: (v: JoinView) => void }) {
  const { trip } = view
  const o = trip.organizerName
  const toast = useToast()
  const [adding, setAdding] = useState<'behalf' | 'self' | null>(null)
  const [reporting, setReporting] = useState(false)
  const people = payees(view)
  const dialogs = (
    <>
      {adding && (
        <Dialog
          title={
            adding === 'behalf'
              ? 'Add another traveler'
              : trip.waitlisting
                ? 'Join the waitlist yourself'
                : 'Join the trip yourself'
          }
          onClose={() => setAdding(null)}
        >
          <JoinForm
            view={view}
            fixed={adding}
            onChange={(v) => {
              setAdding(null)
              onChange(v)
              if (adding === 'self') toast({ text: 'You’re signed up too.' })
            }}
            onRefresh={onChange}
          />
        </Dialog>
      )}
      {reporting && (
        <ReportPayment
          view={view}
          people={people}
          onDone={(v) => {
            setReporting(false)
            onChange(v)
            toast({ text: `Payment reported to ${o}. They’ll confirm it arrived.` })
            window.dispatchEvent(new Event('cc:actions-changed'))
          }}
          onClose={() => setReporting(false)}
        />
      )}
    </>
  )
  return (
    <>
      <TravelersCard
        view={view}
        onPay={() => setReporting(true)}
        onAdd={() => setAdding('behalf')}
        onJoinMyself={() => setAdding('self')}
      />
      {dialogs}
    </>
  )
}

/** Where a traveler someone signed up stands, in a few words. */
export function travelerStatus(trip: PublicTrip, g: MyGuest): string {
  const full = trip.maxGuests !== null && trip.spotsTaken >= trip.maxGuests
  if (g.status === 'declined') return g.refundSentAt ? 'Not taken, refunded' : 'Not taken'
  if (g.status === 'approved') return 'Accepted'
  if (trip.joinMode === 'accept_first') return `Waiting for ${trip.organizerName} to accept`
  if (g.refundSentAt) return 'Payment refunded'
  if (g.waitlistedAt && !g.offeredAt) return 'On the waitlist'
  if (g.spotPaidAt)
    return full ? 'The trip filled first, refund coming' : 'Paid, waiting to be accepted'
  if (g.payments.some((p) => p.status === 'reported')) return 'Payment sent'
  if (!payable(trip, g)) return 'Every spot is taken'
  return 'Pay to hold their spot'
}

/**
 * A guest's payments, newest first, with the organizer's credits and charges among them (issue #17), each with the
 * organizer's reason.
 */
export function MyPayments({
  payments,
  adjustments,
  organizer,
  title = 'Transaction history',
}: {
  payments: MyGuest['payments']
  adjustments: MyGuest['adjustments']
  organizer: string
  title?: string
}) {
  const lines = [
    ...payments.filter(shown.payment).map((p) => ({ at: p.reportedAt, p, a: null })),
    ...adjustments.filter(shown.adjustment).map((a) => ({ at: a.createdAt, p: null, a })),
  ].sort((x, y) => y.at.localeCompare(x.at))
  if (lines.length === 0) return null
  return (
    <div className="border-t border-rule pt-4">
      <h3 className="text-sm font-semibold text-muted">{title}</h3>
      <ul>
        {lines.map(({ p, a }) =>
          a ? (
            <li
              key={a.id}
              className="flex flex-wrap justify-between gap-x-3 border-t border-rule py-2 first:border-t-0"
            >
              <span>
                <span className="font-semibold">{adjustmentAmount(a)}</span>{' '}
                <span className="text-body">· {a.reason}</span>
              </span>
              <span className="text-muted">From {organizer}</span>
            </li>
          ) : (
            <li
              key={p.id}
              className="flex flex-wrap justify-between gap-x-3 border-t border-rule py-2 first:border-t-0"
            >
              <span>
                <span className="font-semibold">
                  {/* Only a payment that arrived or is on its way lowers the balance. */}
                  {(p.status === 'confirmed' || p.status === 'reported') && '−'}
                  {money(
                    p.status === 'confirmed' ? (p.receivedPaymentAmount ?? 0) : p.guestPaymentAmount
                  )}{' '}
                  payment
                </span>{' '}
                <span className="text-body">
                  · {p.method} · {shortDate(p.sentOn)}
                </span>
              </span>
              <span
                className={
                  p.status === 'not_received' ? 'font-semibold text-[#B42318]' : 'text-muted'
                }
              >
                {paymentStatus(p.status, organizer)}
              </span>
            </li>
          )
        )}
      </ul>
    </div>
  )
}

/**
 * Reporting a payment (owner's decision, 2026-10-24): how much they sent, how and when, and that they sent it. Less
 * than is due now needs a line saying why. Every problem shows beside its field before they press the button. Someone
 * who looks after other travelers says who the payment is for, with each one's share (issue #11).
 */
