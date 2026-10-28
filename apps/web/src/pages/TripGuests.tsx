// Trip Control's two sections (owner's choice, 2026-10-24): Actions at the top, counted in a red badge, each with one
// filled button, and Manage Guests, everyone in line order, one line each. Every change to a guest is in their Details
// dialog. Payments are a log (owner's decision, 2026-10-24): each payment a guest reports is its own action.
import {
  confirmedCents,
  guestActions,
  waitlistSpotOpen,
  type Guest,
  type GuestEvent,
  type GuestUpdate,
  type OrganizerTrip,
  type Payment,
  type PaymentDecision,
  type PaymentLog,
  type TripRoom,
} from '@cc/types'
import {
  Check,
  ChevronRight,
  Copy,
  Hourglass,
  Info,
  ListChecks,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Dialog } from '@/components/Dialog'
import { useAdminView } from '@/components/AdminView'
import { api } from '@/lib/api'
import { money, shortDate } from '@/lib/format'
import { centsFrom, dollarsFor, dueWhenSent, paymentStatus, today } from '@/lib/payments'
import { signupOrder, waitlist } from '@/lib/signups'
import { SignedCopy, UndoConfirm } from './ControlPanelPage'
import { GuestDetails } from './GuestDetails'

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

const filled =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg bg-royal px-3 text-sm font-semibold text-white hover:bg-royal-dark'

const outlined =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-royal px-3 text-sm font-semibold text-royal hover:bg-royal-pale'

const field =
  'min-h-[44px] rounded-lg border border-[#5B6B80] bg-white px-3 text-base text-ink focus:outline-none focus:ring-2 focus:ring-royal'

interface Props {
  trip: OrganizerTrip
  rooms: TripRoom[]
  onUpdate: (guest: Guest, update: GuestUpdate) => unknown
  /** The organizer's decision on a reported payment; true when it saved. */
  onDecide: (paymentId: string, decision: PaymentDecision) => Promise<boolean>
  /** A payment the organizer saw arrive, logged as confirmed; true when it saved. */
  onLog: (guest: Guest, log: PaymentLog) => Promise<boolean>
  /** Why the last change didn't save, shown in an open Details dialog (the page's own line is behind it). */
  error?: string | null
}

/** The line in order, and whether every spot is taken. */
function lineOf(trip: OrganizerTrip) {
  const line = signupOrder(trip.guests)
  const accepted = line.filter((x) => x.status === 'approved').length
  return { line, accepted, full: trip.maxGuests !== null && accepted >= trip.maxGuests }
}

/** "Zelle · (555) 010-0177" → "Zelle": the handle is the organizer's own, so the action line leaves it out. */
const methodName = (p: Payment) => p.method.split(' · ')[0]

/** Where a guest stands, in a few words. */
function standing(g: Guest, trip: OrganizerTrip, full: boolean): string {
  const payFirst = trip.joinMode !== 'accept_first'
  const paid = confirmedCents(g)
  const reported = g.payments.filter((p) => p.status === 'reported').at(-1)
  if (g.status === 'declined')
    return g.refundSentAt ? `Turned down · refunded ${day(g.refundSentAt)}` : 'Turned down'
  if (g.status === 'approved') {
    if (g.spotPaidAt) return `Accepted · paid ${day(g.spotPaidAt)}`
    if (reported) return `Accepted · says they paid ${shortDate(reported.sentOn)}`
    if (paid) return `Accepted · ${money(paid)} paid so far`
    return 'Accepted · waiting on payment'
  }
  if (!g.signedAt) return 'Hasn’t signed'
  if (g.waitlistedAt && !g.offeredAt) return `On the waitlist since ${day(g.waitlistedAt)}`
  if (g.offeredAt && !paid && !reported)
    return `Offered a spot ${day(g.offeredAt)} · waiting on payment`
  if (!payFirst) return `Signed ${day(g.signedAt)}${full ? ' · trip full' : ''}`
  if (g.spotPaidAt) return `Spot paid ${day(g.spotPaidAt)}${full ? ' · trip full: refund' : ''}`
  if (reported) return `Says they paid ${shortDate(reported.sentOn)}`
  if (paid) return `${money(paid)} paid, short of the first payment`
  return `Signed ${day(g.signedAt)} · waiting on payment`
}

/**
 * What the organizer does next for a guest (owner's wording, 2026-10-24), in words. The rules are shared with the API
 * (guestActions in packages/types), so the red counts elsewhere match this list. Each payment the guest reported is
 * its own action: one that covers what was due is confirmed with a tap; a short one is reviewed with the guest's note.
 */
type Action =
  | { kind: 'payment'; key: string; text: string; note: string; payment: Payment; short: boolean }
  | { kind: 'accept'; key: string; text: string; update: GuestUpdate }
  // The button opens Details, where turning them down asks for "Refund sent".
  | { kind: 'refund'; key: string; text: string }

function actionsFor(g: Guest, trip: OrganizerTrip): Action[] {
  const first = g.terms ? money(g.terms.firstInstallmentCents) : 'the first payment'
  return guestActions(g, trip).map((a): Action => {
    switch (a.kind) {
      case 'payment': {
        const p = a.payment
        const amount = a.short
          ? `${money(p.guestPaymentAmount)} of ${money(a.due)}`
          : money(p.guestPaymentAmount)
        return {
          kind: 'payment',
          key: a.key,
          text: `Paid ${amount} by ${methodName(p)} on ${shortDate(p.sentOn)}${!a.short && a.due ? ` · due ${money(a.due)}` : ''}`,
          note: p.note,
          payment: p,
          short: a.short,
        }
      }
      case 'refund':
        return {
          kind: 'refund',
          key: a.key,
          text: `Paid ${money(a.paidCents)} but the trip is full`,
        }
      case 'accept':
        return {
          kind: 'accept',
          key: a.key,
          text:
            trip.joinMode === 'accept_first'
              ? `Requested to join your trip on ${day(g.createdAt)} and signed the trip agreement`
              : g.spotPaidAt
                ? `Requested to join your trip on ${day(g.createdAt)} and paid the required ${first}`
                : `Paid ${money(confirmedCents(g))} of ${first}. Accepting them holds their spot anyway.`,
          update: { status: 'approved' },
        }
    }
  })
}

/** One guest in Manage Guests: name, where they stand, when they joined, how much has arrived, and Details. */
function GuestRow({
  g,
  n,
  trip,
  full,
  onDetails,
}: {
  g: Guest
  n: number
  trip: OrganizerTrip
  full: boolean
  onDetails: () => void
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule py-3 first:border-t-0">
      <span className="w-5 font-semibold text-muted">{n}</span>
      <div className="min-w-0 flex-[1_1_140px]">
        <div className="font-semibold">
          {g.firstName} {g.lastName}
        </div>
        <div className="text-sm text-muted">
          {standing(g, trip, full)} · joined {day(g.createdAt)}
        </div>
        {g.terms && g.status !== 'declined' && <Paid terms={g.terms} />}
      </div>
      <div className="ml-auto flex gap-2">
        <button type="button" onClick={onDetails} className={outlined}>
          Details
        </button>
      </div>
    </li>
  )
}

/**
 * One action: who, what happened, the filled button that does it, and Details. A payment carries a how-to tip, and a
 * short one the guest's note.
 */
function ActionRow({
  g,
  action,
  onUpdate,
  onDecide,
  onReview,
  onDetails,
}: {
  g: Guest
  action: Action
  onUpdate: Props['onUpdate']
  onDecide: Props['onDecide']
  onReview: (payment: Payment) => void
  onDetails: () => void
}) {
  const [help, setHelp] = useState(false)
  const [busy, setBusy] = useState(false)
  const button =
    action.kind === 'payment'
      ? action.short
        ? 'Review payment'
        : 'Confirm payment'
      : action.kind === 'accept'
        ? 'Accept trip guest'
        : 'Refund and turn down'
  async function act() {
    if (action.kind === 'refund') return onDetails()
    if (action.kind === 'payment' && action.short) return onReview(action.payment)
    setBusy(true)
    try {
      await (action.kind === 'payment'
        ? onDecide(action.payment.id, { status: 'confirmed' })
        : onUpdate(g, action.update))
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule py-3 first:border-t-0">
      <div className="min-w-0 flex-[1_1_200px]">
        <div className="font-semibold">
          {g.firstName} {g.lastName}
        </div>
        <div className="flex items-center gap-1 text-sm text-body">
          <span>{action.text}</span>
          {action.kind === 'payment' && (
            <button
              type="button"
              onClick={() => setHelp(!help)}
              aria-expanded={help}
              aria-label="What to check"
              className="-my-3 grid h-11 w-11 shrink-0 place-items-center text-royal"
            >
              <Info className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {action.kind === 'payment' && action.note && (
          <div className="text-sm italic text-body">&ldquo;{action.note}&rdquo;</div>
        )}
      </div>
      <div className="ml-auto flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={act}
          className={`${filled} disabled:opacity-60`}
        >
          {button}
        </button>
        <button type="button" onClick={onDetails} className={outlined}>
          Details
        </button>
      </div>
      {help && (
        <p className="w-full rounded-xl bg-royal-pale px-4 py-3 text-sm text-ink">
          Check {action.kind === 'payment' ? methodName(action.payment) : 'your payments'}. If the
          money is there, confirm it. Confirm payments in the order they arrived.
        </p>
      )}
    </li>
  )
}

/**
 * Checking a reported payment (owner's decision, 2026-10-24): what the guest said they sent, how, when and why it is
 * short, with what arrived filled in from what they said, so confirming is one tap unless it differs.
 */
function ReviewPayment({
  g,
  payment: p,
  onDecide,
  onClose,
  error,
}: {
  g: Guest
  payment: Payment
  onDecide: Props['onDecide']
  onClose: () => void
  error?: string | null
}) {
  const [amount, setAmount] = useState(dollarsFor(p.guestPaymentAmount))
  const [busy, setBusy] = useState(false)
  const cents = centsFrom(amount)
  const due = g.terms ? dueWhenSent(p, g.payments, g.terms) : 0
  async function decide(decision: PaymentDecision) {
    setBusy(true)
    try {
      if (await onDecide(p.id, decision)) onClose()
    } finally {
      setBusy(false)
    }
  }
  function confirm(e: FormEvent) {
    e.preventDefault()
    if (cents) void decide({ status: 'confirmed', receivedPaymentAmount: cents })
  }
  return (
    <Dialog title={`${g.firstName}’s payment`} onClose={onClose}>
      <form onSubmit={confirm} className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <p className="text-body">
          {g.firstName} says they sent <strong>{money(p.guestPaymentAmount)}</strong> by{' '}
          {methodName(p)} on {shortDate(p.sentOn)}.{due > 0 && ` ${money(due)} was due.`}
        </p>
        {p.note && (
          <p className="rounded-xl bg-royal-pale px-4 py-3 text-ink">
            <span className="block text-sm font-semibold">Why it’s less</span>
            {p.note}
          </p>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          What arrived
          <input
            className={field}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={!cents}
          />
          {!cents ? (
            <span className="font-semibold text-[#B42318]">
              Enter what arrived, or choose Not received.
            </span>
          ) : (
            due > 0 &&
            cents < due && (
              <span className="font-normal text-muted">
                Short of what was due: it counts toward their balance, and their spot isn’t paid
                until the rest arrives or you accept them.
              </span>
            )
          )}
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy || !cents}
            className={`${filled} disabled:opacity-60`}
          >
            Confirm {cents ? money(cents) : ''}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide({ status: 'not_received' })}
            className={outlined}
          >
            Not received
          </button>
        </div>
      </form>
    </Dialog>
  )
}

/** Logging a payment the organizer saw arrive (cash handed over, a transfer they spotted): confirmed as it's logged. */
function LogPayment({
  g,
  onLog,
  onClose,
  error,
}: {
  g: Guest
  onLog: Props['onLog']
  onClose: () => void
  error?: string | null
}) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')
  const [sentOn, setSentOn] = useState(today())
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const cents = centsFrom(amount)
  const problems: Record<string, string> = {}
  // What's left: the price less what arrived or is waiting to be confirmed (as the API counts it).
  const left = g.terms
    ? Math.max(0, g.terms.priceCents - g.terms.paidCents - g.terms.pendingCents)
    : Infinity
  if (!cents) problems.amount = 'Enter how much arrived.'
  else if (cents > left) problems.amount = `That’s more than the ${money(left)} left to pay.`
  if (!method.trim()) problems.method = 'Say how it was paid.'
  if (!sentOn) problems.sentOn = 'Enter the day it arrived.'
  else if (sentOn > today()) problems.sentOn = 'That day hasn’t happened yet.'
  async function submit(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (Object.keys(problems).length > 0) return
    setBusy(true)
    try {
      const saved = await onLog(g, {
        receivedPaymentAmount: cents,
        method: method.trim(),
        sentOn,
        note: note.trim(),
      })
      if (saved) onClose()
    } finally {
      setBusy(false)
    }
  }
  const touch = (k: string) => () => setTouched((t) => ({ ...t, [k]: true }))
  const problem = (k: string) =>
    (tried || touched[k]) && problems[k] ? (
      <span className="font-semibold text-[#B42318]">{problems[k]}</span>
    ) : null
  return (
    <Dialog title={`Log a payment from ${g.firstName}`} onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Amount
          <input
            className={field}
            inputMode="decimal"
            placeholder="$0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={touch('amount')}
          />
          {problem('amount')}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          How it was paid
          <input
            className={field}
            placeholder="Cash, in person"
            maxLength={160}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            onBlur={touch('method')}
          />
          {problem('method')}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Day it arrived
          <input
            type="date"
            className={field}
            value={sentOn}
            max={today()}
            onChange={(e) => setSentOn(e.target.value)}
            onBlur={touch('sentOn')}
          />
          {problem('sentOn')}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Note (optional)
          <input
            className={field}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className={`${filled} self-start disabled:opacity-60`}
        >
          Log payment
        </button>
      </form>
    </Dialog>
  )
}

/** A section's icon in a royal-pale circle, as on the homepage's cards. */
export function IconCircle({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-royal-pale text-royal">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  )
}

/** How much of a guest's price has arrived, as a bar and in words. */
function Paid({ terms }: { terms: NonNullable<Guest['terms']> }) {
  const paid = terms.priceCents - terms.balanceCents
  const pct = terms.priceCents ? Math.round((paid / terms.priceCents) * 100) : 0
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Paid so far"
        className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-royal-pale"
      >
        <div className="h-full rounded-full bg-royal" style={{ width: `${pct}%` }} />
      </div>
      <span className="whitespace-nowrap text-sm text-body">
        {money(paid)} of {money(terms.priceCents)} paid
      </span>
    </div>
  )
}

/** A labelled contact detail with a button that copies it. */
export function Contact({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // The browser refused (no permission or not a secure page): the value is still there to select.
    }
  }
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <dt className="font-semibold text-muted">{label}</dt>
        <dd className="break-all text-body">{value}</dd>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
        title={copied ? 'Copied' : 'Copy'}
        className="group -mr-2 grid h-11 w-11 shrink-0 place-items-center"
      >
        {/* Small to look at, 44 px to tap. */}
        <span className="grid h-8 w-8 place-items-center rounded-lg border border-royal text-royal group-hover:bg-royal-pale">
          {copied ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
      </button>
    </div>
  )
}

/** Everything about one guest and every change, in a dialog, so the list stays one line per guest. */
export type DetailsProps = Props & {
  g: Guest
  full: boolean
  onRead: (guest: Guest) => void
  onHistory: (guest: Guest) => void
  onReview: (guest: Guest, payment: Payment) => void
  onLogOpen: (guest: Guest) => void
  onClose: () => void
}

/** One payment in a guest's Details: amount, how, when, where it stands, and the organizer's next step on it. */
export function PaymentLine({
  p,
  g,
  onReview,
  onDecide,
}: {
  p: Payment
  g: Guest
  onReview: () => void
  onDecide: Props['onDecide']
}) {
  const admin = useAdminView()
  // A payment the organizer logged was never the guest's word, so it can't go back to waiting: undoing it removes it.
  const logged = p.loggedBy === 'organizer'
  // Taking back the payment that paid a waiting guest's spot loses their place in line; otherwise only the balance moves.
  const warning =
    g.status !== 'approved' && g.spotPaidAt
      ? 'They lose their place in line.'
      : 'Their balance goes back up.'
  const arrived =
    p.status === 'confirmed' && p.receivedPaymentAmount !== p.guestPaymentAmount
      ? ` (${money(p.receivedPaymentAmount ?? 0)} arrived)`
      : ''
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-t border-rule py-2 text-sm first:border-t-0">
      <span className="min-w-0">
        <span className="font-semibold">{money(p.guestPaymentAmount)}</span> · {p.method} ·{' '}
        {shortDate(p.sentOn)}
        <span className="block text-muted">
          {logged
            ? p.status === 'confirmed'
              ? 'Logged by an organizer'
              : 'Logged by an organizer · removed'
            : paymentStatus(p.status, 'you')}
          {arrived}
        </span>
        {p.note && <span className="block italic text-body">&ldquo;{p.note}&rdquo;</span>}
      </span>
      {admin ? null : p.status === 'reported' ? (
        <button type="button" onClick={onReview} className={outlined}>
          Review
        </button>
      ) : p.status === 'confirmed' ? (
        <UndoConfirm
          warning={warning}
          onUndo={() => onDecide(p.id, { status: logged ? 'not_received' : 'reported' })}
        />
      ) : p.status === 'not_received' && !logged ? (
        <button
          type="button"
          onClick={() => onDecide(p.id, { status: 'reported' })}
          className={outlined}
        >
          Undo
        </button>
      ) : null}
    </li>
  )
}

/** One history line in plain words. Payment lines say how much: what the guest said they sent, or what arrived. */
export function eventText(e: GuestEvent): string {
  const amount = e.amount !== null ? ` ${money(e.amount)}` : ''
  switch (e.kind) {
    case 'joined':
      return 'Joined the trip'
    case 'waitlisted':
      return 'Joined the waitlist (the trip was full)'
    case 'offered':
      return 'Offered a spot that opened'
    case 'offer_withdrawn':
      return 'Offer withdrawn, back on the waitlist'
    case 'signed':
      return 'Signed the trip agreement'
    case 'said_paid':
      return `Said they paid${amount}`
    case 'payment_confirmed':
      return amount ? `Confirmed${amount} arrived` : 'Payment confirmed'
    case 'payment_not_received':
      return 'Marked a payment as not received'
    case 'payment_undone':
      return 'Undid a payment decision'
    case 'accepted':
      return 'Accepted onto the trip'
    case 'turned_down':
      return 'Turned down'
    case 'put_back':
      return 'Put back to waiting'
    case 'refund_sent':
      return 'Refund marked as sent'
    case 'refund_undone':
      return 'Refund mark taken off'
    case 'room_changed':
      return e.toRoom
        ? e.fromRoom
          ? `Room changed from ${e.fromRoom} to ${e.toRoom}`
          : `Room set to ${e.toRoom}`
        : 'Room cleared'
    case 'contact_changed':
      return `Contact details changed: ${e.fields.join(', ')}`
  }
}

/** Everything that happened to a guest, oldest first, and who did it. */
function GuestHistory({
  tripId,
  guest,
  onClose,
}: {
  tripId: string
  guest: Guest
  onClose: () => void
}) {
  const [events, setEvents] = useState<GuestEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const admin = useAdminView()
  useEffect(() => {
    api
      .getGuestHistory(tripId, guest.id, admin)
      .then(setEvents)
      .catch(() => setError('The history could not be loaded.'))
  }, [tripId, guest.id, admin])
  const by = (e: GuestEvent) =>
    e.actor === 'guest' ? guest.firstName : e.actor === 'organizer' ? 'An organizer' : 'Travel HQ'
  // Newest first, under a heading for each day, as a timeline: money and the guest's spot in royal, the rest quieter.
  const days = new Map<string, GuestEvent[]>()
  for (const e of [...(events ?? [])].reverse()) {
    const d = new Date(e.at).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    days.set(d, [...(days.get(d) ?? []), e])
  }
  const key = (k: GuestEvent['kind']) =>
    k.startsWith('payment') ||
    k === 'said_paid' ||
    k === 'accepted' ||
    k === 'turned_down' ||
    k === 'refund_sent'
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return (
    <Dialog title={`${guest.firstName}’s history`} onClose={onClose}>
      {error && (
        <p role="alert" className="font-semibold text-[#B42318]">
          {error}
        </p>
      )}
      {events && events.length === 0 && <p className="text-body">Nothing recorded yet.</p>}
      <div className="flex flex-col gap-5">
        {[...days].map(([d, list]) => (
          <section key={d}>
            <h3 className="mb-2 text-sm font-semibold text-muted">{d}</h3>
            <ol className="relative ml-2 border-l-2 border-rule">
              {list.map((e, i) => (
                <li key={i} className="relative pb-3 pl-5 last:pb-0">
                  <span
                    aria-hidden="true"
                    className={`absolute -left-[7px] top-1.5 h-3 w-3 rounded-full ring-2 ring-white ${
                      key(e.kind) ? 'bg-royal' : 'bg-rule'
                    }`}
                  />
                  <div className="font-semibold leading-snug">{eventText(e)}</div>
                  <div className="text-sm text-muted">
                    {time(e.at)} · {by(e)}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </Dialog>
  )
}

/**
 * The dialogs both sections open for a guest: Details, and from it the signed copy, the history, reviewing a payment
 * and logging one. One at a time: Details closes before the others open, and comes back when they close.
 */
function useGuestDialogs(props: Props, full: boolean, onDetailsClose?: () => void) {
  const { trip } = props
  const [open, setOpen] = useState<string | null>(null)
  const [reading, setReading] = useState<Guest | null>(null)
  const [history, setHistory] = useState<Guest | null>(null)
  const [review, setReview] = useState<{ guestId: string; paymentId: string } | null>(null)
  const [logging, setLogging] = useState<string | null>(null)
  // The guest whose Details opened the dialog on screen: closing it goes back to their Details (owner's decision,
  // 2026-10-26), not to the page.
  const [back, setBack] = useState<string | null>(null)
  const done = (close: () => void) => () => {
    close()
    if (back) setOpen(back)
    setBack(null)
  }
  const find = (id: string | null | undefined) => trip.guests.find((x) => x.id === id)
  const g = find(open)
  const reviewing = find(review?.guestId)
  const reviewed = reviewing?.payments.find((p) => p.id === review?.paymentId)
  const logFor = find(logging)
  const dialogs = (
    <>
      {g && (
        <GuestDetails
          {...props}
          g={g}
          full={full}
          onRead={(x) => {
            setBack(x.id)
            setReading(x)
          }}
          onHistory={(x) => {
            setBack(x.id)
            setHistory(x)
          }}
          onReview={(x, p) => {
            setBack(x.id)
            setReview({ guestId: x.id, paymentId: p.id })
          }}
          onLogOpen={(x) => {
            setBack(x.id)
            setLogging(x.id)
          }}
          onClose={() => {
            setOpen(null)
            onDetailsClose?.()
          }}
        />
      )}
      {reading && (
        <SignedCopy tripId={trip.id} guest={reading} onClose={done(() => setReading(null))} />
      )}
      {history && (
        <GuestHistory tripId={trip.id} guest={history} onClose={done(() => setHistory(null))} />
      )}
      {reviewing && reviewed && (
        <ReviewPayment
          g={reviewing}
          payment={reviewed}
          onDecide={props.onDecide}
          onClose={done(() => setReview(null))}
          error={props.error}
        />
      )}
      {logFor && (
        <LogPayment
          g={logFor}
          onLog={props.onLog}
          onClose={done(() => setLogging(null))}
          error={props.error}
        />
      )}
    </>
  )
  return {
    openDetails: setOpen,
    openReview: (x: Guest, p: Payment) => setReview({ guestId: x.id, paymentId: p.id }),
    dialogs,
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * The waitlist (owner's decision, 2026-10-27): everyone waiting for a spot, and the organizer offers one to whoever they
 * pick. Nothing offers a spot on its own, and the order they joined in is only for reading. On an accept-first trip
 * accepting them is the offer.
 */
function WaitlistDialog({
  trip,
  onUpdate,
  onDetails,
  onClose,
  error,
}: {
  trip: OrganizerTrip
  onUpdate: Props['onUpdate']
  onDetails: (guest: Guest) => void
  onClose: () => void
  error?: string | null
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const people = waitlist(trip.guests)
  const acceptFirst = trip.joinMode === 'accept_first'
  const accepted = trip.guests.filter((g) => g.status === 'approved').length
  const left = trip.maxGuests === null ? Infinity : Math.max(0, trip.maxGuests - accepted)
  // Offered a spot and not accepted yet: on the pay-first trips they may still pay for one of the spots left.
  const offered = trip.guests.filter((g) => g.status === 'interested' && g.offeredAt).length
  async function give(g: Guest) {
    setBusy(g.id)
    try {
      await onUpdate(g, acceptFirst ? { status: 'approved' } : { offerSpot: true })
    } finally {
      setBusy(null)
    }
  }
  return (
    <Dialog title="Waitlist" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        <p className="text-body">
          {left === 0
            ? 'Every spot is taken. When one opens, you can give it to anyone here.'
            : `${left === Infinity ? 'Spots are open' : `${plural(left, 'spot', 'spots')} open`}. ${
                acceptFirst
                  ? 'Accept anyone here, and they see how to pay you.'
                  : 'Offer one to anyone here. We text them, and they can pay you.'
              }`}
          {!acceptFirst &&
            offered > 0 &&
            ` ${plural(offered, 'guest was', 'guests were')} offered a spot and ${offered === 1 ? 'hasn’t' : 'haven’t'} been accepted yet.`}
        </p>
        {people.length === 0 ? (
          <p className="text-body">No one is on the waitlist.</p>
        ) : (
          <ul>
            {people.map((g) => (
              <li
                key={g.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule py-3 first:border-t-0"
              >
                <div className="min-w-0 flex-[1_1_140px]">
                  <div className="font-semibold">
                    {g.firstName} {g.lastName}
                  </div>
                  <div className="text-sm text-muted">Waiting since {day(g.waitlistedAt!)}</div>
                </div>
                <div className="ml-auto flex gap-2">
                  {left > 0 && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => give(g)}
                      className={`${filled} disabled:opacity-60`}
                    >
                      {acceptFirst ? 'Accept trip guest' : 'Offer the spot'}
                    </button>
                  )}
                  <button type="button" onClick={() => onDetails(g)} className={outlined}>
                    Details
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  )
}

/** The guest dialogs plus the waitlist; Details opened from the waitlist goes back to it on closing. */
function useDialogs(props: Props, full: boolean) {
  const [showing, setShowing] = useState(false)
  const [back, setBack] = useState(false)
  const guests = useGuestDialogs(props, full, () => {
    if (back) setShowing(true)
    setBack(false)
  })
  const dialogs = (
    <>
      {guests.dialogs}
      {showing && (
        <WaitlistDialog
          trip={props.trip}
          onUpdate={props.onUpdate}
          error={props.error}
          onDetails={(g) => {
            setShowing(false)
            setBack(true)
            guests.openDetails(g.id)
          }}
          onClose={() => setShowing(false)}
        />
      )}
    </>
  )
  return { ...guests, openWaitlist: () => setShowing(true), dialogs }
}

/**
 * Everyone who joined, in line order, one line each. Next steps are in Actions, so these lines have none. The waitlist
 * is a count that opens it (owner's decision, 2026-10-27).
 */
export function GuestsCard(props: Props) {
  const { trip } = props
  const { line: all, accepted, full } = lineOf(trip)
  const { openDetails, openWaitlist, dialogs } = useDialogs(props, full)
  const waiting = waitlist(trip.guests).length
  const line = all.filter((x) => !(x.status === 'interested' && x.waitlistedAt && !x.offeredAt))
  const max = trip.maxGuests
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-card sm:p-6">
      <h2 className="flex items-center gap-3 text-xl font-extrabold">
        <IconCircle icon={Users} />
        Manage Guests
      </h2>
      <p className="text-body">
        {trip.joinMode === 'first_come'
          ? 'First come, first served: confirming a payment gives that guest the next spot.'
          : trip.joinMode === 'pay_first'
            ? 'Accept each guest once they’ve signed and their payment arrived.'
            : 'Accept each guest once they’ve signed. Then they see how to pay you.'}{' '}
        {max ? `${accepted} of ${max} spots taken.` : `${accepted} accepted. No limit set.`}
      </p>
      {waiting > 0 && (
        <button
          type="button"
          onClick={openWaitlist}
          className={`${outlined} justify-between gap-3 py-2 text-left`}
        >
          <span className="flex items-center gap-3">
            <Hourglass className="h-5 w-5" aria-hidden="true" />
            {plural(waiting, 'person', 'people')} on the waitlist
          </span>
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
      {line.length === 0 ? (
        <p className="rounded-xl bg-ground p-4 text-body">No one has signed up yet.</p>
      ) : (
        <ul>
          {line.map((x, i) => (
            <GuestRow
              key={x.id}
              g={x}
              n={i + 1}
              trip={trip}
              full={full}
              onDetails={() => openDetails(x.id)}
            />
          ))}
        </ul>
      )}
      {dialogs}
    </section>
  )
}

/**
 * What needs doing on the trip, counted in a red badge. Its own section, above Manage Guests, because other trip actions
 * (reminders, payments due) will join it.
 */
export function ActionsCard(props: Props) {
  const { trip, onUpdate, onDecide } = props
  const { line, full } = lineOf(trip)
  const { openDetails, openReview, openWaitlist, dialogs } = useDialogs(props, full)
  const todo = line.flatMap((x) => actionsFor(x, trip).map((action) => ({ g: x, action })))
  const spotOpen = waitlistSpotOpen(trip)
  const waiting = waitlist(trip.guests).length
  const count = todo.length + (spotOpen ? 1 : 0)
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-white p-5 shadow-card sm:p-6">
      <h2 className="flex items-center gap-3 text-xl font-extrabold">
        <IconCircle icon={ListChecks} />
        Actions
        {count > 0 && (
          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-[#B42318] px-1.5 text-sm font-bold text-white">
            {count}
            <span className="sr-only"> to do</span>
          </span>
        )}
      </h2>
      {count === 0 ? (
        <p className="text-body">Nothing needs you right now.</p>
      ) : (
        <ul>
          {spotOpen && (
            <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule py-3 first:border-t-0">
              <div className="min-w-0 flex-[1_1_200px]">
                <div className="font-semibold">Waitlist</div>
                <div className="text-sm text-body">
                  A spot opened, and {plural(waiting, 'person is', 'people are')} on the waitlist.
                  Give it to anyone you pick.
                </div>
              </div>
              <div className="ml-auto flex gap-2">
                <button type="button" onClick={openWaitlist} className={filled}>
                  Open waitlist
                </button>
              </div>
            </li>
          )}
          {todo.map(({ g: x, action }) => (
            <ActionRow
              key={action.key}
              g={x}
              action={action}
              onUpdate={onUpdate}
              onDecide={onDecide}
              onReview={(p) => openReview(x, p)}
              onDetails={() => openDetails(x.id)}
            />
          ))}
        </ul>
      )}
      {dialogs}
    </section>
  )
}
