import { createHash } from 'node:crypto'
import type { AgreementPreview, GuestTerms, JoinMode } from '../trips/trip-types'

/**
 * CrewControl's trip agreement: one fixed template, filled from the trip's own facts. Organizers cannot edit it (owner's
 * decision, 2026-10-21). Change the wording only with a new TEMPLATE_VERSION, and only after a lawyer has reviewed it:
 * this first version has not been reviewed. A guest's signature keeps the text exactly as they saw it, so changing the
 * template never changes what anyone already signed.
 */
export const TEMPLATE_VERSION = '2026-10-24'

/** The trip facts the agreement quotes. A trip row and the public trip both have them. */
export interface AgreementFacts {
  name: string
  destination: string
  startDate: string
  endDate: string
  organizerName: string
  costPerPersonCents: number
  installmentCount: number
  joinMode: string
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

/** The refund promise. Turning a paid guest down needs the organizer to say they sent this refund. */
export function refundTerms(organizer: string, joinMode: string): string {
  const before =
    joinMode === 'accept_first'
      ? `You pay nothing until ${organizer} accepts you. If ${organizer} turns you down after you paid anything, ` +
        `${organizer} refunds it in full.`
      : `If ${organizer} does not accept you, or the trip is full by the time your payment is confirmed, ` +
        `${organizer} refunds everything you paid, in full.`
  return (
    `${before} If you drop out after you are accepted, money you paid comes back only if ${organizer} fills your ` +
    `spot with someone else, and only as much as that person pays for it. If ${organizer} removes you from the ` +
    `trip, ${organizer} refunds everything you paid.`
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

/** The agreement for a trip as it stands now, as plain text with blank lines between sections. */
export function agreementText(trip: AgreementFacts): string {
  const o = trip.organizerName
  const first = firstInstallmentCents(trip.costPerPersonCents, trip.installmentCount)
  const plan =
    trip.installmentCount <= 1
      ? `paid in one payment of ${money(trip.costPerPersonCents)}`
      : `paid in ${trip.installmentCount} installments, the first of ${money(first)}`
  return [
    `Trip agreement for ${trip.name}`,
    `This is an agreement between you and ${o}, who organizes the trip. CrewControl is the app the trip is run ` +
      `with. It is not a party to this agreement, and it never holds or moves your money.`,
    `1. The trip\n${trip.name}, ${trip.destination}, from ${trip.startDate} to ${trip.endDate}.`,
    `2. Your price\n${money(trip.costPerPersonCents)} per person, ${plan}. You pay ${o} directly, the way ` +
      `${o}'s payment instructions say.`,
    `3. Your spot\n${spotTerms(o, trip.joinMode as JoinMode)}`,
    `4. Refunds\n${refundTerms(o, trip.joinMode)}`,
    `5. If the trip changes\nIf ${o} changes the trip's dates or destination after you sign, you may leave the ` +
      `trip for a full refund of what you paid, or stay on.`,
    `6. The organizer's role\n${o} collects the group's money and pays the trip's costs on the group's behalf. ` +
      `${o} is not a travel company.`,
    `7. Signing\nYou're signing electronically: your typed name and ticking "I agree" are your signature. You can ` +
      `ask ${o} for a paper copy instead. You get a copy of what you signed.`,
  ].join('\n\n')
}

export const hashOf = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex')

export function agreementPreview(trip: AgreementFacts): AgreementPreview {
  const text = agreementText(trip)
  return { text, textHash: hashOf(text), templateVersion: TEMPLATE_VERSION }
}

/** The terms a signature saved, with the balance worked out from them and the payment the organizer confirmed. */
export function termsOf(
  sig: {
    priceCents: number
    installmentCount: number
    startDate: string
    endDate: string
    refundTerms: string
  },
  paymentConfirmedAt: Date | null
): GuestTerms {
  const first = firstInstallmentCents(sig.priceCents, sig.installmentCount)
  return {
    priceCents: sig.priceCents,
    installmentCount: sig.installmentCount,
    startDate: sig.startDate,
    endDate: sig.endDate,
    refundTerms: sig.refundTerms,
    firstInstallmentCents: first,
    balanceCents: sig.priceCents - (paymentConfirmedAt ? first : 0),
  }
}
