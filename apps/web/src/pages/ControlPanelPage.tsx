import type {
  BalanceAdjustmentInput,
  DismissReceiptReason,
  ForwardedReceiptItem,
  Guest,
  GuestUpdate,
  MatchReceiptInput,
  OrganizerTrip,
  PaymentDecision,
  PaymentLog,
  SignedAgreement,
  TripRoom,
} from '@cc/types'
import { ArrowLeft, Lightbulb, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AccountMenu } from '@/components/AccountMenu'
import { AdminViewNote, useAdminFallback, useAdminView } from '@/components/AdminView'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Dialog } from '@/components/Dialog'
import { FlyerDialog } from '@/components/FlyerDialog'
import { Logo } from '@/components/Logo'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api'
import { money } from '@/lib/format'
import { DangerZone } from './DeleteTrip'
import { ActionsCard, GuestsCard, transferOf } from './TripGuests'
import type { OrganizerGoingInput } from './OrganizerGoing'
import { useTripInterest } from './TripInterest'
import { TripLinkCard } from './TripLink'
import { TripLogCard } from './TripLog'
import { AnnouncementsCard } from './TripAnnouncements'
import { useTripQuestions } from './TripQuestions'
import { RemindersCard } from './TripReminders'
import { MoneyCard } from './TripMoney'

// The organizer's Trip Control panel: what needs doing on the trip (Actions), then its guests in line order. The trip's rooms, price and payment schedule are set in the
// trip editor (steps 3 and 4).

export function ControlPanelPage() {
  const { id = '' } = useParams()
  const [trip, setTrip] = useState<OrganizerTrip | null>(null)
  const [rooms, setRooms] = useState<TripRoom[]>([])
  const [guestError, setGuestError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const admin = useAdminView()
  const [flyer, setFlyer] = useState(false)
  const toAdminView = useAdminFallback(id, 'control')

  useEffect(() => {
    Promise.all([api.getTrip(id, admin), api.getRooms(id, admin)])
      .then(([t, r]) => {
        setTrip(t)
        setRooms(r)
      })
      .catch((err) => toAdminView(err) || setError('This trip could not be loaded.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, admin])

  /** True when the change saved; otherwise the reason shows on the page and in any open dialog. */
  async function save(change: () => Promise<OrganizerTrip>): Promise<boolean> {
    return Boolean(await saveTrip(change))
  }
  /** The trip as saved, or null when the change didn't save (the reason shows on the page and in any open dialog). */
  async function saveTrip(change: () => Promise<OrganizerTrip>): Promise<OrganizerTrip | null> {
    setGuestError(null)
    try {
      const saved = await change()
      setTrip(saved)
      // The red count in the account menu drops what was just done.
      window.dispatchEvent(new Event('cc:actions-changed'))
      return saved
    } catch (err) {
      setGuestError(err instanceof Error ? err.message : 'That change did not save.')
      return null
    }
  }
  // Each change that saved says so in a toast, with Undo where it can be undone in one step.
  async function updateGuest(guest: Guest, update: GuestUpdate) {
    const saved = await save(() => api.updateGuest(id, guest.id, update))
    if (!saved) return false
    const name = guest.firstName
    if (update.offerSpot) toast({ text: `Spot offered to ${name}. We texted them.` })
    else if (update.withdrawOffer)
      toast({ text: `Offer to ${name} withdrawn. They’re back on the waitlist.` })
    else if (update.status === 'approved' && guest.status !== 'approved')
      toast({
        // An accept-first guest is emailed how to pay as they're accepted; Undo can't take that back.
        text:
          trip?.joinMode === 'accept_first'
            ? `${name} is on the trip. We emailed them how to pay.`
            : `${name} is on the trip.`,
        action: { label: 'Undo', onClick: () => void updateGuest(guest, { status: 'interested' }) },
      })
    else if (update.status === 'declined') toast({ text: `${name} was turned down.` })
    else if (update.status === 'interested' && guest.status !== 'interested')
      toast({ text: `${name} is back to waiting.` })
    else if (update.roomId !== undefined) toast({ text: `${name}’s room changed.` })
    else if (update.email !== undefined)
      toast({ text: `${name}’s email is now ${update.email}. Their next emails go there.` })
    else if (update.emailProblemSeen) toast({ text: `Noted. ${name} won’t get Travel HQ emails.` })
    else if (update.managedBy !== undefined) {
      const by = trip?.guests.find((g) => g.id === update.managedBy)
      // Undo puts back who handled it before, when that's someone who can be picked again.
      const before = guest.managedBy ? guest.managedBy.guestId : null
      toast({
        text: by
          ? `${by.firstName} now handles ${name}’s sign-up and payments.`
          : `${name} now handles their own sign-up and payments.`,
        ...(guest.managedBy && !before
          ? {}
          : {
              action: {
                label: 'Undo',
                onClick: () => void updateGuest(guest, { managedBy: before }),
              },
            }),
      })
    }
    return true
  }
  async function decidePayment(paymentId: string, decision: PaymentDecision) {
    const guest = trip?.guests.find((g) => g.payments.some((p) => p.id === paymentId))
    const payment = guest?.payments.find((p) => p.id === paymentId)
    // One transfer for several travelers is decided as one (issue #11).
    const members = trip && payment ? transferOf(trip, payment) : []
    const saved = await saveTrip(() => api.decidePayment(id, paymentId, decision))
    if (!saved || !guest || !payment) return Boolean(saved)
    // On a first come trip confirming may have given them the spot too: Undo gives it back first.
    const people = members.length > 1 ? members.map((m) => m.g) : [guest]
    const tookSpot = people.filter(
      (g) =>
        g.status !== 'approved' && saved.guests.find((x) => x.id === g.id)?.status === 'approved'
    )
    const undo = {
      label: 'Undo',
      onClick: async () => {
        for (const g of tookSpot)
          if (!(await save(() => api.updateGuest(id, g.id, { status: 'interested' })))) return
        // A forwarded receipt's payment marked not received goes back to how it was (it was never the guest's
        // word waiting for you); any other goes back to waiting.
        void decidePayment(paymentId, {
          status:
            payment.loggedBy === 'email' && decision.status === 'not_received'
              ? payment.status === 'refunded'
                ? 'reported'
                : payment.status
              : 'reported',
        })
      },
    }
    const who =
      members.length > 1
        ? `${payment.paidByName || guest.firstName} for ${people.map((g) => g.firstName).join(' and ')}`
        : guest.firstName
    const spot =
      tookSpot.length === 0
        ? ''
        : members.length > 1
          ? ` ${tookSpot.map((g) => g.firstName).join(' and ')} got a spot.`
          : ' They have a spot.'
    if (decision.status === 'confirmed') {
      const amount =
        decision.shares?.reduce((n, x) => n + x.receivedPaymentAmount, 0) ??
        decision.receivedPaymentAmount ??
        (members.length > 1
          ? members.reduce((n, m) => n + m.p.guestPaymentAmount, 0)
          : payment.guestPaymentAmount)
      toast({ text: `${money(amount)} from ${who} confirmed.${spot}`, action: undo })
    }
    const theirs = members.length > 1 ? `the payment from ${who}` : `${guest.firstName}’s payment`
    if (decision.status === 'not_received')
      toast({ text: `Marked ${theirs} not received.`, action: undo })
    else if (decision.status === 'reported')
      toast({ text: `${theirs[0].toUpperCase()}${theirs.slice(1)} is waiting again.` })
    return true
  }
  async function logPayment(guest: Guest, log: PaymentLog) {
    const saved = await save(() => api.logPayment(id, guest.id, log))
    if (saved)
      toast({ text: `${money(log.receivedPaymentAmount)} from ${guest.firstName} logged.` })
    return saved
  }
  async function addAdjustment(guest: Guest, input: BalanceAdjustmentInput) {
    const saved = await saveTrip(() => api.addAdjustment(id, guest.id, input))
    if (!saved) return false
    // The one that wasn't there before (not simply the newest: another organizer may have added one too); Undo takes
    // it back, which the guest's history keeps as removed.
    const before = new Set(guest.adjustments.map((a) => a.id))
    const added = saved.guests
      .find((g) => g.id === guest.id)
      ?.adjustments.find((a) => !before.has(a.id))
    toast({
      text: `${money(input.amountCents)} ${input.kind} for ${guest.firstName} added.`,
      ...(added
        ? {
            action: {
              label: 'Undo',
              onClick: () => void removeAdjustment({ ...guest, adjustments: [added] }, added.id),
            },
          }
        : {}),
    })
    return true
  }
  async function removeAdjustment(guest: Guest, adjustmentId: string) {
    const a = guest.adjustments.find((x) => x.id === adjustmentId)
    const saved = await save(() => api.removeAdjustment(id, adjustmentId))
    if (saved && a)
      toast({ text: `${money(a.amountCents)} ${a.kind} for ${guest.firstName} removed.` })
    return saved
  }
  // A room that costs more or less than the guest signed (issue #30): the difference as a charge or credit, or left.
  async function settleRoomPrice(guest: Guest, adjust: boolean) {
    const diff = guest.roomPriceDiffCents
    const saved = await saveTrip(() => api.settleRoomPrice(id, guest.id, adjust))
    if (!saved) return false
    toast({
      text: adjust
        ? `${money(Math.abs(diff))} ${diff > 0 ? 'charge' : 'credit'} for ${guest.firstName} added.`
        : `${guest.firstName}’s balance stays as signed.`,
    })
    return true
  }
  async function matchReceipt(r: ForwardedReceiptItem, input: MatchReceiptInput) {
    const saved = await saveTrip(() => api.matchReceipt(id, r.id, input))
    const guest = trip?.guests.find((g) => g.id === input.guestId)
    if (!saved || !guest) return Boolean(saved)
    // On a first come trip, confirming may have given them a spot too.
    const spot =
      guest.status !== 'approved' &&
      saved.guests.find((g) => g.id === guest.id)?.status === 'approved'
        ? ' They have a spot.'
        : ''
    toast({
      text: input.confirm
        ? `${money(input.amountCents)} from ${guest.firstName} confirmed.${spot}`
        : `${money(input.amountCents)} receipt matched to ${guest.firstName}.`,
    })
    return true
  }
  async function dismissReceipt(r: ForwardedReceiptItem, reason: DismissReceiptReason) {
    const saved = await save(() => api.dismissReceipt(id, r.id, reason))
    if (saved) toast({ text: 'Receipt dismissed.' })
    return saved
  }
  async function forgetSender(guest: Guest, senderId: string) {
    const s = trip?.receipts.senders.find((x) => x.id === senderId)
    const saved = await save(() => api.forgetReceiptSender(id, senderId))
    if (saved && s)
      toast({ text: `Receipts from ${s.address} won’t be filed on ${guest.firstName} now.` })
    return saved
  }
  // An organizer taking a spot on their own trip, and giving it back (issue #53).
  async function goingToo(input: OrganizerGoingInput) {
    const saved = await save(() => api.goingToo(id, input))
    if (saved)
      toast({
        text: 'You’re on the trip. You took a spot.',
        action: { label: 'Undo', onClick: () => void notGoing() },
      })
    return saved
  }
  async function notGoing() {
    const saved = await save(() => api.notGoing(id))
    if (saved) toast({ text: 'You gave up your spot.' })
    return saved
  }
  const handlers = {
    onRoomPrice: settleRoomPrice,
    onUpdate: updateGuest,
    onDecide: decidePayment,
    onLog: logPayment,
    onAdjust: addAdjustment,
    onRemoveAdjustment: removeAdjustment,
    onForgetSender: forgetSender,
  }
  const receiptHandlers = { onMatchReceipt: matchReceipt, onDismissReceipt: dismissReceipt }
  // Guests' questions (issue #13): the organizer's to answer, so not on the admin's read-only view.
  const questions = useTripQuestions(admin ? null : trip)
  // The save the date's Interested list (issue #47), the organizer's to work.
  const interest = useTripInterest(admin ? null : trip, setTrip)

  if (error) return <p className="p-8 text-body">{error}</p>
  if (!trip) return <div className="min-h-screen bg-ground" aria-busy="true" />

  return (
    <div className="min-h-screen bg-ground pb-16 text-ink">
      <header className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-3 px-5 py-4">
        <Logo />
        <div className="flex items-center gap-3">
          <Link
            to={admin ? '/admin/trips' : '/organize'}
            aria-label={admin ? 'Manage Trips' : 'Your trips'}
            className={`${admin ? 'inline-flex' : 'hidden sm:inline-flex'} min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-royal px-2.5 font-semibold text-royal hover:bg-royal-pale sm:px-4`}
          >
            {/* On a phone the buttons show their icons only, so the header stays on one line. An organizer's way
                back is in the account menu there. The flyer is in Advertise your trip, above Actions. */}
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{admin ? 'Manage Trips' : 'Your trips'}</span>
          </Link>
          {/* An organizer's owners and organizers are in the Danger zone; an admin seats itself here. */}
          {admin && (
            <Link
              to={`/admin/trips/${id}/people`}
              aria-label="People"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-royal bg-royal px-2.5 font-semibold text-white hover:bg-royal-dark sm:px-4"
            >
              <Users className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">People</span>
            </Link>
          )}
          <AccountMenu />
        </div>
      </header>
      {flyer && <FlyerDialog trip={trip} onClose={() => setFlyer(false)} />}

      <main className="mx-auto flex max-w-[960px] flex-col gap-6 px-5">
        <div>
          <p className="text-sm font-semibold text-muted">Trip Control panel</p>
          <h1 className="text-3xl font-extrabold">{trip.name}</h1>
        </div>

        {admin && <AdminViewNote tripId={id} />}
        {guestError && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {guestError}
          </p>
        )}
        {!admin && <TripLinkCard trip={trip} onFlyer={() => setFlyer(true)} />}
        {/* What needs the organizer is theirs to do, not an admin's. */}
        {!admin && (
          <ActionsCard
            trip={trip}
            rooms={rooms}
            {...handlers}
            {...receiptHandlers}
            questionRows={[...interest.actionRows, ...questions.actionRows]}
            error={guestError}
          />
        )}
        {!admin && <AnnouncementsCard trip={trip} />}
        {/* Under Announcements, one thin row (owner's decision, 2026-10-31). Opens the contact form. */}
        {!admin && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-royal-pale px-4 py-2">
            <p className="flex items-center gap-2 text-sm text-ink">
              <Lightbulb className="h-4 w-4 shrink-0 text-royal" aria-hidden="true" />
              Missing something you need to run your trip? Tell us.
            </p>
            {/* Drawn 36px tall; the ::after keeps the tap area at 44px. */}
            <Link
              to="/contact?topic=feature"
              className="relative inline-flex min-h-[36px] shrink-0 items-center rounded-lg border border-royal bg-white px-3 text-sm font-semibold text-royal after:absolute after:-inset-1 hover:bg-royal-pale"
            >
              Request a feature
            </Link>
          </div>
        )}
        <MoneyCard trip={trip} />
        <GuestsCard
          trip={trip}
          rooms={rooms}
          {...handlers}
          error={guestError}
          {...(admin ? {} : { onGoing: goingToo, onNotGoing: notGoing })}
        />
        {interest.card}
        {!admin && <RemindersCard trip={trip} />}
        <TripLogCard trip={trip} />
        {/* Last on the page (owner's decision, 2026-10-30). */}
        {questions.card}
        {/* Below everything, owners only (owner's decision, 2026-10-30); the admin never deletes a trip. */}
        {!admin && <DangerZone tripId={trip.id} tripName={trip.name} />}
      </main>
    </div>
  )
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

const smallOutlined =
  'inline-flex min-h-[44px] items-center rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale'

/** A guest's spot: accept, put back, turn down (a paid guest needs "Refund sent" ticked), or undo. */
export function Spot({
  guest: g,
  full,
  payFirst,
  onUpdate,
  row = false,
}: {
  guest: Guest
  full: boolean
  payFirst: boolean
  onUpdate: (guest: Guest, update: GuestUpdate) => void
  /** Buttons side by side (the Details layouts under review), not stacked. */
  row?: boolean
}) {
  const admin = useAdminView()
  // Where they stand (a label, with a word on their payment), then the buttons that change it (owner's decision,
  // 2026-10-26: the status never sits among the buttons as if it were one).
  const paid = g.payments.some((p) => p.status === 'confirmed')
  const reported = g.payments.some((p) => p.status === 'reported')
  const payment = g.spotPaidAt
    ? `Paid ${when(g.spotPaidAt)}`
    : reported
      ? 'Says they paid'
      : paid
        ? 'Part paid'
        : 'Waiting on payment'
  const waiting = !g.signedAt
    ? 'Not signed'
    : payFirst && !paid
      ? 'Waiting on payment'
      : full
        ? paid
          ? 'Trip full: refund them'
          : 'Trip full'
        : null
  const [label, detail, actions] =
    g.status === 'declined'
      ? [
          'Turned down',
          g.refundSentAt ? `Refund sent ${when(g.refundSentAt)}` : null,
          <button
            type="button"
            onClick={() => onUpdate(g, { status: 'interested' })}
            className={smallOutlined}
          >
            Undo
          </button>,
        ]
      : g.status === 'approved'
        ? [
            'Accepted',
            payment,
            <>
              <PutBack name={g.firstName} onPutBack={() => onUpdate(g, { status: 'interested' })} />
              <TurnDown guest={g} onUpdate={onUpdate} />
            </>,
          ]
        : [
            // A spot opens to any guest who signed and, where guests pay first, whose payment arrived: on a first
            // come trip that is someone put back to waiting, or waiting when a spot freed up.
            'Waiting',
            g.refundSentAt
              ? `Refund sent ${when(g.refundSentAt)}`
              : g.waitlistedAt && !g.offeredAt
                ? 'On the waitlist'
                : waiting,
            <>
              {!waiting && (
                <button
                  type="button"
                  onClick={() => onUpdate(g, { status: 'approved' })}
                  className={smallOutlined}
                >
                  Accept
                </button>
              )}
              {g.offeredAt && !paid && !reported && <WithdrawOffer guest={g} onUpdate={onUpdate} />}
              <TurnDown guest={g} onUpdate={onUpdate} />
            </>,
          ]
  return (
    <span className="flex flex-col items-start gap-2 text-sm">
      <span>
        <span className={`font-semibold ${g.status === 'approved' ? 'text-royal' : 'text-ink'}`}>
          {label}
        </span>
        {detail && <span className="text-muted"> · {detail}</span>}
      </span>
      {!admin && (
        <span
          className={`flex ${row ? 'flex-row flex-wrap items-start gap-2' : 'flex-col items-start gap-1'}`}
        >
          {actions}
        </span>
      )}
    </span>
  )
}

/** Taking an accepted guest's spot away asks first, in a modal. */
function PutBack({ name, onPutBack }: { name: string; onPutBack: () => void }) {
  const [asking, setAsking] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAsking(true)} className={smallOutlined}>
        Move back to waiting
      </button>
      {asking && (
        <ConfirmDialog
          title={`Move ${name} back to waiting?`}
          confirmLabel="Move back to waiting"
          onConfirm={() => {
            setAsking(false)
            onPutBack()
          }}
          onCancel={() => setAsking(false)}
        >
          <p>They lose their spot. Their payments stay recorded.</p>
        </ConfirmDialog>
      )}
    </>
  )
}

/** Taking back a spot offered from the waitlist asks first, in a modal: the guest gets a text. */
function WithdrawOffer({
  guest: g,
  onUpdate,
}: {
  guest: Guest
  onUpdate: (guest: Guest, update: GuestUpdate) => void
}) {
  const [asking, setAsking] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAsking(true)} className={smallOutlined}>
        Withdraw offer
      </button>
      {asking && (
        <ConfirmDialog
          title={`Withdraw ${g.firstName}’s offer?`}
          confirmLabel="Withdraw offer"
          onConfirm={() => {
            setAsking(false)
            onUpdate(g, { withdrawOffer: true })
          }}
          onCancel={() => setAsking(false)}
        >
          <p>
            They go back on the waitlist and can’t pay until you offer them a spot again. We text
            them.
          </p>
        </ConfirmDialog>
      )}
    </>
  )
}

/**
 * Turning a guest down takes a second tap. A guest whose payment arrived is owed a full refund, so the organizer
 * ticks "Refund sent" first (owner's decision, 2026-10-21). Travel HQ records it and moves no money.
 */
function TurnDown({
  guest: g,
  onUpdate,
}: {
  guest: Guest
  onUpdate: (guest: Guest, update: GuestUpdate) => void
}) {
  const [asking, setAsking] = useState(false)
  const [refunded, setRefunded] = useState(false)
  const paid = g.payments.some((p) => p.status === 'confirmed')
  const reported = g.payments.some((p) => p.status === 'reported')
  return (
    <>
      <button type="button" onClick={() => setAsking(true)} className={smallOutlined}>
        Turn down
      </button>
      {asking && (
        <ConfirmDialog
          title={`Turn ${g.firstName} down?`}
          confirmLabel="Turn down"
          disabled={paid && !refunded}
          onConfirm={() => {
            setAsking(false)
            onUpdate(g, { status: 'declined', ...(paid ? { refundSent: true } : {}) })
          }}
          onCancel={() => {
            setAsking(false)
            setRefunded(false)
          }}
        >
          {paid ? (
            <>
              <p>
                {g.firstName} paid
                {g.terms ? ` ${money(g.terms.paidCents)}` : ''}, so they get everything back. Send
                the refund first, then tick the box.
              </p>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-royal-pale px-4 py-3 text-ink">
                <input
                  type="checkbox"
                  checked={refunded}
                  onChange={(e) => setRefunded(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-royal"
                />
                <span>Refund sent</span>
              </label>
            </>
          ) : reported ? (
            <p>
              {g.firstName} says they paid. If it arrived, confirm it first so the refund is
              recorded.
            </p>
          ) : (
            <p>They come off the trip. You can undo this.</p>
          )}
        </ConfirmDialog>
      )}
    </>
  )
}

/** The agreement a guest signed, exactly as they saw it, with when and from where. */
export function SignedCopy({
  tripId,
  guest,
  onClose,
}: {
  tripId: string
  guest: Guest
  onClose: () => void
}) {
  const [copy, setCopy] = useState<SignedAgreement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const admin = useAdminView()
  useEffect(() => {
    api
      .getGuestAgreement(tripId, guest.id, admin)
      .then(setCopy)
      .catch(() => setError('The signed copy could not be loaded.'))
  }, [tripId, guest.id, admin])
  // The agreement's text is a title, then sections ("1. The trip", a line break, its words) between blank lines.
  const blocks = (copy?.text ?? '').split(/\n\n+/)
  const proof = 'grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm'
  return (
    <Dialog title={`${guest.firstName}’s signed agreement`} onClose={onClose}>
      {error && (
        <p role="alert" className="font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      {copy && (
        <div className="flex flex-col gap-4">
          <p className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
            Signed by typing <strong>&ldquo;{copy.typedName}&rdquo;</strong> on{' '}
            {when(copy.signedAt)}.
          </p>
          <article className="flex flex-col gap-3 rounded-xl border border-rule p-4 text-[15px] text-body">
            {blocks.map((b, i) => {
              const [first, ...rest] = b.split('\n')
              if (i === 0)
                return (
                  <h3 key={i} className="font-display text-lg font-extrabold text-ink">
                    {first}
                  </h3>
                )
              return /^\d+\.\s/.test(first) && rest.length ? (
                <section key={i}>
                  <h4 className="font-semibold text-ink">{first}</h4>
                  <p className="whitespace-pre-line">{rest.join('\n')}</p>
                </section>
              ) : (
                <p key={i} className="whitespace-pre-line">
                  {b}
                </p>
              )
            })}
          </article>
          <section className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
            <h3 className="mb-2 text-sm font-semibold">Proof of signing</h3>
            <dl className={proof}>
              <dt className="text-muted">Signed</dt>
              <dd>{when(copy.signedAt)}</dd>
              <dt className="text-muted">Name typed</dt>
              <dd>{copy.typedName}</dd>
              <dt className="text-muted">From</dt>
              <dd className="break-all">{copy.ipAddress || 'An unknown address'}</dd>
              <dt className="text-muted">Browser</dt>
              <dd className="break-all">{copy.userAgent || 'Unknown'}</dd>
              <dt className="text-muted">Version</dt>
              <dd>{copy.templateVersion}</dd>
              <dt className="text-muted">Fingerprint</dt>
              <dd className="break-all font-mono text-xs">{copy.textHash}</dd>
            </dl>
          </section>
        </div>
      )}
    </Dialog>
  )
}

/**
 * Undoing a confirmed payment loses the guest's place in line (confirming again stamps a new time), so it takes a
 * second tap that says so.
 */
export function UndoConfirm({
  onUndo,
  warning = 'They lose their place in line.',
  label = 'Undo',
  title = 'Undo this payment?',
}: {
  onUndo: () => void
  warning?: string
  label?: string
  title?: string
}) {
  const [asking, setAsking] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="inline-flex min-h-[44px] items-center rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale"
      >
        {label}
      </button>
      {asking && (
        <ConfirmDialog
          title={title}
          confirmLabel={label === 'Undo' ? 'Undo payment' : label}
          onConfirm={() => {
            setAsking(false)
            onUndo()
          }}
          onCancel={() => setAsking(false)}
        >
          <p>{warning}</p>
        </ConfirmDialog>
      )}
    </>
  )
}
