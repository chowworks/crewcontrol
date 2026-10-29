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
  const dropOut =
    (refundPolicy as RefundPolicy) === 'first_payment_kept'
      ? `If you drop out after you're accepted, your first payment (${money(firstCents)}) isn't refunded. Money ` +
        `you paid after it comes back only if ${organizer} fills your spot, and only as much as that person pays ` +
        `for it.`
      : `If you drop out after you're accepted, money you paid comes back only if ${organizer} fills your spot, ` +
        `and only as much as that person pays for it.`
  const before =
    joinMode === 'accept_first'
      ? `You pay nothing until ${organizer} accepts you. If ${organizer} turns you down after you paid anything, ` +
        `${organizer} refunds it in full.`
      : `If ${organizer} does not accept you, or the trip is full by the time your payment is confirmed, ` +
        `${organizer} refunds everything you paid, in full.`
  return (
    `${organizer} chose this for the trip: ${dropOut} Every trip run on Travel HQ also has these terms, and ` +
    `${organizer} agreed to them: ${before} If ${organizer} removes you from the trip, ${organizer} refunds ` +
    `everything you paid.`
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
  const party = `${name || o}${aka ? ` (${aka})` : ''}`
  const first = firstInstallmentCents(trip.costPerPersonCents, trip.installmentCount)
  const plan =
    trip.installmentCount <= 1
      ? `paid in one payment of ${money(trip.costPerPersonCents)}`
      : `paid in ${trip.installmentCount} installments, the first of ${money(first)}`
  return [
    `Trip agreement between you and ${o}`,
    `This agreement is between you, the guest, and ${party}, who organizes ${trip.name}. ` +
      (onBehalf
        ? `${AGREEMENT_SIGNER} signs it on behalf of ${AGREEMENT_TRAVELER}, the traveler, and takes on ` +
          `everything it asks of ${AGREEMENT_TRAVELER}, including paying for their spot. Where it says "you", ` +
          `it means ${AGREEMENT_TRAVELER}, with ${AGREEMENT_SIGNER} acting for them. `
        : '') +
      `Every promise in it is ${o}'s. Travel HQ supplies this standard form and the app the trip runs on, and nothing more: it is ` +
      `not a party to this agreement, does not plan, book or sell the trip, never holds, moves or refunds your ` +
      `money, and is not responsible for what ${o} promises here or does or doesn't deliver. If something goes ` +
      `wrong, you and ${o} settle it between you.`,
    `1. The trip\n${trip.name}, ${trip.destination}, from ${trip.startDate} to ${trip.endDate}. ${o} can ` +
      `change the trip's details; section 5 says what happens if ${o} does.`,
    `2. Your price\n${money(trip.costPerPersonCents)} per person, ${plan}. You pay ${o} directly, the way ` +
      `${o}'s payment instructions say. ${o} can't raise your price after you sign. Travel HQ keeps a record of ` +
      `the payments you and ${o} report; when ${o} confirms a payment there, that is ${o}'s receipt, not ` +
      `Travel HQ's.`,
    `3. Your spot\n${spotTerms(o, trip.joinMode as JoinMode)}`,
    `4. ${o}'s refund terms\n${refundTerms(o, trip.joinMode, trip.refundPolicy, first)}`,
    `5. If the trip changes or is cancelled\nIf ${o} changes the trip's dates or destination after you sign, ` +
      `${o} tells you. If you can't make the new plan, or ${o} cancels the trip, ${o} refunds what you paid, ` +
      `less any money ${o} already spent on the trip and can't get back; ${o} shows you what that was.`,
    `6. Signing\nYou're signing electronically: your typed name and ticking "I agree" are your signature. You ` +
      `can ask ${o} for a paper copy instead. Travel HQ keeps a copy of what you signed, and you and ${o} can ` +
      `see it any time.`,
  ].join('\n\n')
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
