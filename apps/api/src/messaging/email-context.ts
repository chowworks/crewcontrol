import { money } from '../join/agreement'
import { canPay, owed } from '../join/guest-pay'
import {
  PAYMENT_METHOD_KINDS,
  totalDueCents,
  type JoinView,
  type MyGuest,
  type PaymentMethod,
} from '../trips/trip-types'
import type { GuestEmailContext } from './email-template'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '2027-06-12' → "Jun 12, 2027"; anything else as it is. */
export function day(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : iso
}

/** "Jun 12 – 19, 2027", "Jun 28 – Jul 3, 2027", "Dec 30, 2027 – Jan 2, 2028". */
export function dateRange(start: string, end: string): string {
  const [a, b] = [day(start), day(end)]
  if (start.slice(0, 4) !== end.slice(0, 4)) return `${a} – ${b}`
  const year = start.slice(0, 4)
  const from = a.replace(`, ${year}`, '')
  const to =
    start.slice(0, 7) === end.slice(0, 7)
      ? String(Number(end.slice(8)))
      : b.replace(`, ${year}`, '')
  return `${from} – ${to}, ${year}`
}

const STATUS = { interested: 'Signed', approved: 'Accepted', declined: 'Turned down' } as const

/**
 * What an email to a guest who joined can use, from their join page's view (`JoinService.view`) and what only the
 * server knows: their contact details and how the trip takes payment. Payment details are always here (owner's
 * decision, 2026-10-28); whether an email shows them is up to its wording, which checks guest.canPay, the same rule
 * as their join page.
 */
export interface GuestFacts {
  email: string
  phone: string
  paymentMethods: PaymentMethod[]
  paymentInstructions: string
  /** The organizer's email: a guest's reply goes to them, not to Travel HQ (owner's decision, 2026-10-28). */
  replyTo?: string
}

/**
 * What an email to a guest uses of their join page's view: the trip and their own place on it. An organizer's step
 * (accepting a guest) builds the same from Trip Control's data.
 */
export interface GuestEmailView {
  trip: Pick<
    JoinView['trip'],
    | 'slug'
    | 'name'
    | 'destination'
    | 'startDate'
    | 'endDate'
    | 'organizerName'
    | 'description'
    | 'costPerPersonCents'
    | 'installmentCount'
    | 'highlights'
    | 'keyDates'
    | 'joinMode'
    | 'refundPolicy'
  > & { rooms: { id: string; name: string }[] }
  me: Pick<
    MyGuest,
    'firstName' | 'lastName' | 'status' | 'roomId' | 'waitlistedAt' | 'offeredAt' | 'terms'
  > | null
}

export function guestEmailContext(
  view: GuestEmailView,
  facts: GuestFacts,
  webUrl: string
): GuestEmailContext {
  const { trip, me } = view
  if (!me) throw new Error('An email to a guest needs a guest who joined')
  const terms = me.terms
  const left = terms ? owed(terms) : null
  const plan = terms?.schedule ?? []
  const hasDeposit = plan.length > 1 && plan[0].amountCents !== plan[1].amountCents
  return {
    trip: {
      name: trip.name,
      destination: trip.destination,
      startDate: day(trip.startDate),
      endDate: day(trip.endDate),
      dates: dateRange(trip.startDate, trip.endDate),
      organizerName: trip.organizerName,
      description: trip.description,
      pricePerPerson: money(trip.costPerPersonCents),
      installmentCount: trip.installmentCount,
      pageLink: `${webUrl}/t/${trip.slug}`,
      joinLink: `${webUrl}/t/${trip.slug}/join`,
      highlights: trip.highlights.map((h) => ({ title: h.title, detail: h.detail })),
      keyDates: trip.keyDates.map((k) => ({ date: day(k.date), label: k.label })),
    },
    guest: {
      firstName: me.firstName,
      lastName: me.lastName,
      fullName: `${me.firstName} ${me.lastName}`.trim(),
      email: facts.email,
      phone: facts.phone,
      status: STATUS[me.status],
      accepted: me.status === 'approved',
      canPay: canPay(trip.joinMode, me),
      waitlisted: Boolean(me.waitlistedAt) && !me.offeredAt && me.status !== 'approved',
      room: trip.rooms.find((r) => r.id === me.roomId)?.name ?? '',
    },
    paymentDetails:
      terms && left
        ? {
            methods: facts.paymentMethods.map((m) => ({
              name:
                m.kind === 'custom'
                  ? m.label.trim() || 'Other'
                  : (PAYMENT_METHOD_KINDS.find((k) => k.kind === m.kind)?.name ?? 'Other'),
              handle: m.handle.trim(),
            })),
            oneMethod: facts.paymentMethods.length === 1,
            instructions: facts.paymentInstructions,
            price: money(terms.priceCents),
            // The organizer's credits and charges (issue #17), signed, and the price with them.
            adjustments:
              terms.adjustmentCents === 0
                ? ''
                : `${terms.adjustmentCents < 0 ? '−' : '+'}${money(Math.abs(terms.adjustmentCents))}`,
            total: money(totalDueCents(terms)),
            firstPayment: money(terms.firstInstallmentCents),
            // A deposit: the signed plan's first payment differs from the rest ("Deposit first").
            deposit: hasDeposit,
            depositKept: hasDeposit && trip.refundPolicy === 'first_payment_kept',
            paid: money(terms.paidCents),
            pending: money(terms.pendingCents),
            left: money(left.left),
            dueNow: money(left.dueNow),
            installmentCount: terms.installmentCount,
          }
        : undefined,
  }
}
