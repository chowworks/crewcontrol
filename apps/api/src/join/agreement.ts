import { createHash } from 'node:crypto'
import type {
  AgreementPreview,
  GuestTerms,
  JoinMode,
  Payment,
  RefundPolicy,
} from '../trips/trip-types'
import { AGREEMENT_SIGNER, AGREEMENT_TRAVELER } from '../trips/trip-types'

/**
 * Travel HQ's trip agreement: one fixed template, filled from the trip's own facts. Organizers cannot edit it (owner's
 * decision, 2026-10-21); they pick a refund policy from presets this file words (owner's decision, 2026-10-26). Travel
 * HQ supplies the form but is not a party: every term reads as the organizer's (owner's decision, 2026-10-28). Change
 * the wording only with a new TEMPLATE_VERSION, and only after a lawyer has reviewed it: this version has not been reviewed. A guest's signature keeps the text exactly as they saw it, so changing the
 * template never changes what anyone already signed.
 */
export const TEMPLATE_VERSION = '2026-10-29.2'

/** The trip facts the agreement quotes. A trip row and the public trip both have them. */
export interface AgreementFacts {
  name: string
  destination: string
  startDate: string
  endDate: string
  organizerName: string
  /** Who the agreement is with, from the trip owner's sign-in (TripsService.organizerContact); none on sample trips. */
  organizer?: { name: string; email: string } | null
  costPerPersonCents: number
  installmentCount: number
  joinMode: string
  refundPolicy: string
}

/** 120000 → "$1,200"; 120050 → "$1,200.50" (as the web app's money()). */
function money(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  })
}

/** The first installment: the price split evenly, with any odd cents on the last one. */
export function firstInstallmentCents(priceCents: number, installmentCount: number): number {
  return installmentCount <= 1 ? priceCents : Math.floor(priceCents / installmentCount)
}

/** What happens when a guest drops out, under the refund policy the organizer picked. */
function dropOutTerms(organizer: string, refundPolicy: string, firstPayment: string): string {
  return (refundPolicy as RefundPolicy) === 'first_payment_kept'
    ? `If you drop out after you're accepted, your first payment (${firstPayment}) isn't refunded. Money you paid ` +
        `after it comes back only if ${organizer} fills your spot, and only as much as that person pays for it.`
    : `If you drop out after you're accepted, money you paid comes back only if ${organizer} fills your spot, and ` +
        `only as much as that person pays for it.`
}

/** The refund a guest is owed when they don't get a spot, which depends on how the trip lets guests in. */
function notAcceptedTerms(organizer: string, joinMode: string): string {
  return joinMode === 'accept_first'
    ? `You pay nothing until ${organizer} accepts you. If ${organizer} turns you down after you paid anything, ` +
        `${organizer} refunds it in full.`
    : `If ${organizer} does not accept you, or the trip is full by the time your payment is confirmed, ` +
        `${organizer} refunds everything you paid, in full.`
}

const removedTerms = (organizer: string) =>
  `If ${organizer} removes you from the trip, ${organizer} refunds everything you paid.`

/**
 * The refund terms. The drop-out rule is the organizer's pick (the trip's refund policy); the rest every trip on
 * Travel HQ has, and organizers accept them in the Organizer Terms. Turning a paid guest down needs the organizer to say
 * they sent this refund. `firstCents` is the first payment the guest's plan asks for.
 */
export function refundTerms(
  organizer: string,
  joinMode: string,
  refundPolicy: string,
  firstCents: number
): string {
  return (
    `${organizer} chose this for the trip: ${dropOutTerms(organizer, refundPolicy, money(firstCents))} Every trip ` +
    `run on Travel HQ also has these terms, and ${organizer} agreed to them: ` +
    `${notAcceptedTerms(organizer, joinMode)} ${removedTerms(organizer)}`
  )
}

function spotTerms(organizer: string, joinMode: JoinMode): string {
  if (joinMode === 'first_come')
    return (
      `Spots go first come, first served, in the order ${organizer} confirms payments arrived. Signing and paying ` +
      `does not hold a spot until ${organizer} confirms your payment.`
    )
  if (joinMode === 'pay_first')
    return `Signing and paying does not guarantee a spot: ${organizer} accepts who comes, once your payment arrives.`
  return (
    `Signing does not guarantee a spot: ${organizer} accepts who comes. Once ${organizer} accepts you, you pay the ` +
    `first installment the way ${organizer}'s payment instructions say.`
  )
}

/** The words that differ from trip to trip; the rest of the agreement is the same for every trip. */
interface Fill {
  /** The name the trip's pages use for the organizer. */
  o: string
  /** The organizer as the agreement names them: name, display name and email. */
  party: string
  name: string
  /** What the opening adds when someone signs for a traveler they look after; '' otherwise. */
  onBehalf: string
  /** "MV Beach House 2027, Martha's Vineyard, MA, from 2027-06-18 to 2027-06-21" */
  trip: string
  /** "$1,200 per person, paid in 3 installments, the first of $400" */
  price: string
  spot: string
  refunds: string
}

/** The opening's words when someone signs for a traveler they look after (fillAgreementNames fills the names in). */
const ON_BEHALF =
  `${AGREEMENT_SIGNER} signs it on behalf of ${AGREEMENT_TRAVELER}, the traveler, and takes on everything it asks ` +
  `of ${AGREEMENT_TRAVELER}, including paying for their spot. Where it says "you", it means ${AGREEMENT_TRAVELER}, ` +
  `with ${AGREEMENT_SIGNER} acting for them. `

/** The agreement's sections, each a heading and its text, filled in. */
function sections(f: Fill): { heading: string; body: string }[] {
  const o = f.o
  return [
    {
      heading: '',
      body:
        `This agreement is between you, the guest, and ${f.party}, who organizes ${f.name}. ${f.onBehalf}` +
        `Every promise in it is ${o}'s. Travel HQ supplies this standard form and the app the trip runs on, and nothing more: it is ` +
        `not a party to this agreement, does not plan, book or sell the trip, never holds, moves or refunds your ` +
        `money, and is not responsible for what ${o} promises here or does or doesn't deliver. If something goes ` +
        `wrong, you and ${o} settle it between you.`,
    },
    {
      heading: '1. The trip',
      body: `${f.trip}. ${o} can change the trip's details; section 5 says what happens if ${o} does.`,
    },
    {
      heading: '2. Your price',
      body:
        `${f.price}. You pay ${o} directly, the way ${o}'s payment instructions say. ${o} can't raise your price ` +
        `after you sign. Travel HQ keeps a record of the payments you and ${o} report; when ${o} confirms a ` +
        `payment there, that is ${o}'s receipt, not Travel HQ's.`,
    },
    { heading: '3. Your spot', body: f.spot },
    { heading: `4. ${o}'s refund terms`, body: f.refunds },
    {
      heading: '5. If the trip changes or is cancelled',
      body:
        `If ${o} changes the trip's dates or destination after you sign, ${o} tells you. If you can't make the new ` +
        `plan, or ${o} cancels the trip, ${o} refunds what you paid, less any money ${o} already spent on the trip ` +
        `and can't get back; ${o} shows you what that was.`,
    },
    {
      heading: '6. Signing',
      body:
        `You're signing electronically: your typed name and ticking "I agree" are your signature. You can ask ${o} ` +
        `for a paper copy instead. Travel HQ keeps a copy of what you signed, and you and ${o} can see it any time.`,
    },
  ]
}

/**
 * The agreement for a trip as it stands now, as plain text with blank lines between sections. Every promise in it is
 * worded as the organizer's: Travel HQ supplies the form and is not a party (owner's decision, 2026-10-28).
 * `onBehalf`: as someone signs it for a traveler they look after (a child, a roommate), which the opening says once,
 * naming both of them (fillAgreementNames fills the names in).
 */
export function agreementText(trip: AgreementFacts, onBehalf = false): string {
  const o = trip.organizerName
  // "Nia Thompson ("Nia", nia@example.com)": the organizer's name and email from sign-in, beside the name the pages use.
  const name = trip.organizer?.name.trim()
  const email = trip.organizer?.email.trim()
  const aka = [name && name !== o ? `"${o}"` : '', email].filter(Boolean).join(', ')
  const first = firstInstallmentCents(trip.costPerPersonCents, trip.installmentCount)
  const plan =
    trip.installmentCount <= 1
      ? `paid in one payment of ${money(trip.costPerPersonCents)}`
      : `paid in ${trip.installmentCount} installments, the first of ${money(first)}`
  const fill: Fill = {
    o,
    party: `${name || o}${aka ? ` (${aka})` : ''}`,
    name: trip.name,
    onBehalf: onBehalf ? ON_BEHALF : '',
    trip: `${trip.name}, ${trip.destination}, from ${trip.startDate} to ${trip.endDate}`,
    price: `${money(trip.costPerPersonCents)} per person, ${plan}`,
    spot: spotTerms(o, trip.joinMode as JoinMode),
    refunds: refundTerms(o, trip.joinMode, trip.refundPolicy, first),
  }
  return [
    `Trip agreement between you and ${o}`,
    ...sections(fill).map((s) => (s.heading ? `${s.heading}\n${s.body}` : s.body)),
  ].join('\n\n')
}

/** How each of a trip's settings reads in the agreement, as the trip editor names the choices. */
const JOIN_MODE_LABELS: Record<JoinMode, string> = {
  accept_first: 'You accept each guest, then they pay',
  pay_first: 'Guests pay, then you accept',
  first_come: 'First come, first served',
}
const REFUND_POLICY_LABELS: Record<RefundPolicy, string> = {
  spot_filled: 'Refund only if you fill their spot',
  first_payment_kept: 'Keep the first payment',
}

/**
 * The agreement every guest signs, with your trip's details as [placeholders] and each version a trip setting
 * chooses between: the Organizer Terms' addendum (owner's decision, 2026-10-29), so organizers know what they agree to
 * with each guest. Built from the same sections as agreementText, so the two can't drift apart.
 */
export function agreementTemplate(): { heading: string; body: string }[] {
  const o = '[organizer]'
  const modes = Object.keys(JOIN_MODE_LABELS) as JoinMode[]
  const policies = Object.keys(REFUND_POLICY_LABELS) as RefundPolicy[]
  // One line per version; trip settings that read the same are named together.
  const versions = <K extends string>(
    keys: K[],
    label: (k: K) => string,
    text: (k: K) => string
  ) => {
    const lines = new Map<string, K[]>()
    for (const k of keys) lines.set(text(k), [...(lines.get(text(k)) ?? []), k])
    return [...lines].map(([t, ks]) => `- ${ks.map(label).join(' or ')}: "${t}"`).join('\n')
  }
  const [opening, ...rest] = sections({
    o,
    party: '[your full name] ([organizer], [your email])',
    name: '[trip name]',
    onBehalf: '',
    trip: '[trip name], [destination], from [start date] to [end date]',
    price: '[price] per person, paid as your payment plan says',
    spot:
      'It depends on how your trip lets guests in:\n' +
      versions(
        modes,
        (m) => JOIN_MODE_LABELS[m],
        (m) => spotTerms(o, m)
      ),
    refunds:
      'The refund terms you pick for the trip:\n' +
      versions(
        policies,
        (p) => REFUND_POLICY_LABELS[p],
        (p) => dropOutTerms(o, p, '[first payment]')
      ) +
      '\nOn every trip, depending on how it lets guests in:\n' +
      versions(
        modes,
        (m) => JOIN_MODE_LABELS[m],
        (m) => notAcceptedTerms(o, m)
      ) +
      `\nOn every trip: "${removedTerms(o)}"`,
  })
  const signer = (text: string) =>
    text.replaceAll(AGREEMENT_SIGNER, '[signer]').replaceAll(AGREEMENT_TRAVELER, '[traveler]')
  return [
    {
      ...opening,
      body:
        `${opening.body}\nWhen someone signs for a traveler they look after, it adds after its first sentence: ` +
        `"${signer(ON_BEHALF).trim()}"`,
    },
    ...rest,
  ]
}

export const hashOf = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex')

export function agreementPreview(trip: AgreementFacts, onBehalf = false): AgreementPreview {
  const text = agreementText(trip, onBehalf)
  return { text, textHash: hashOf(text), templateVersion: TEMPLATE_VERSION }
}

/** The terms a signature saved, with the balance worked out from them and the payments the organizer confirmed. */
export function termsOf(
  sig: {
    priceCents: number
    installmentCount: number
    startDate: string
    endDate: string
    refundTerms: string
  },
  payments: Pick<Payment, 'status' | 'guestPaymentAmount' | 'receivedPaymentAmount'>[]
): GuestTerms {
  const first = firstInstallmentCents(sig.priceCents, sig.installmentCount)
  const sum = (status: Payment['status'], amount: (p: (typeof payments)[number]) => number) =>
    payments.filter((p) => p.status === status).reduce((n, p) => n + amount(p), 0)
  const paid = sum('confirmed', (p) => p.receivedPaymentAmount ?? 0)
  return {
    priceCents: sig.priceCents,
    installmentCount: sig.installmentCount,
    startDate: sig.startDate,
    endDate: sig.endDate,
    refundTerms: sig.refundTerms,
    firstInstallmentCents: first,
    paidCents: paid,
    pendingCents: sum('reported', (p) => p.guestPaymentAmount),
    balanceCents: sig.priceCents - paid,
  }
}
