import type { ReadReceipt } from './read-receipt'

/** A guest as matching needs them. */
export interface PlaceGuest {
  id: string
  firstName: string
  lastName: string
  status: string
  userId: string | null
  managedByUserId: string | null
  refundSentAt: Date | string | null
  waitlistedAt: Date | string | null
  offeredAt: Date | string | null
  payments: { guestPaymentAmount: number; sentOn: string; status: string }[]
}

/** Who forwarded it, as far as we can tell. */
export interface Sender {
  address: string | null
  /** Resend found DMARC passed for the From address: its domain vouched for it. */
  verified: boolean
  /** The address is a verified sign-in email of one of the trip's owners or organizers. */
  organizer: boolean
  /** The account signed in with that address, when there is one (to find the travelers it looks after). */
  userId: string | null
  /** The guest an organizer said this address belongs to, when they matched an earlier receipt from it. */
  rememberedGuestId?: string | null
}

export type Placement =
  | { kind: 'guest'; guestId: string }
  | { kind: 'unmatched'; reason: string; suggestedGuestId: string | null }
  | { kind: 'rejected'; reason: string }

/** Why a receipt from an address nobody on the trip uses waits: the one case where remembering the sender helps. */
export const FROM_STRANGER = 'It came from an address that isn’t on this trip.'

/** Why a forwarded email was refused, in the Admin toolbox's words. */
export const NOT_A_PAYMENT = 'Not a payment, and not from anyone on the trip'

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

/**
 * The guests a name in a payment email is: the whole name, else first and last name (a middle name left out), else
 * first name and last initial ("Kendra S."), the best of those that finds anyone.
 */
export function guestsNamed<G extends Pick<PlaceGuest, 'firstName' | 'lastName'>>(
  name: string,
  guests: G[]
): G[] {
  const p = norm(name)
  if (p.length < 2) return []
  const first = p[0]
  const last = p[p.length - 1]
  const tiers: ((f: string[], l: string[]) => boolean)[] = [
    (f, l) => [...f, ...l].join(' ') === p.join(' '),
    (f, l) => f[0] === first && l[l.length - 1] === last,
    (f, l) => last.length === 1 && f[0] === first && (l[0] ?? '').startsWith(last),
  ]
  for (const tier of tiers) {
    const hits = guests.filter((g) => {
      const f = norm(g.firstName)
      const l = norm(g.lastName)
      return f.length > 0 && l.length > 0 && tier(f, l)
    })
    if (hits.length) return hits
  }
  return []
}

const days = (a: string, b: string) =>
  Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000

const shortDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

const dollars = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`

/** Whether the guest may pay now, as the database's rule on a guest's own payment says (payment_self_limits). */
function canPay(g: PlaceGuest, joinMode: string): boolean {
  if (g.status === 'declined' || g.refundSentAt) return false
  if (g.status === 'approved') return true
  if (joinMode === 'accept_first') return false
  return !g.waitlistedAt || !!g.offeredAt
}

/**
 * Which guest a forwarded receipt is for, or why the organizer has to say. A guest's own forward (from the verified
 * email of their account) files it on them, or the one traveler their account looks after, but only when it shows
 * money they sent ("You sent $300 to …"): money they received, or an amount with no direction, is no payment of
 * theirs. An organizer's files it on the guest the email names as paying, and only when it shows money coming in;
 * their own guest rows play no part. Anything else (a sender we can't verify or don't know, a name that is no guest or
 * several, no amount, a payment that looks recorded already, a guest who can't pay yet) waits for the organizer, with
 * the likeliest guest suggested. Mail from nobody on the trip that isn't a payment either is refused, so junk never
 * reaches the organizer. Turned-down guests are never picked.
 */
export function placeReceipt(
  read: ReadReceipt,
  sender: Sender,
  guests: PlaceGuest[],
  joinMode = 'pay_first'
): Placement {
  const live = guests.filter((g) => g.status !== 'declined')
  // Only an account's verified email, or an address an organizer tied to a guest, says whose a forward is: a guest's
  // typed email is never checked.
  const theirs = (g: PlaceGuest) =>
    (sender.userId !== null &&
      (g.userId === sender.userId || g.managedByUserId === sender.userId)) ||
    g.id === sender.rememberedGuestId
  const own = sender.organizer ? [] : live.filter(theirs)
  const named = read.payerName ? guestsNamed(read.payerName, live) : []
  const suggest = (pool: PlaceGuest[]) => (pool.length === 1 ? pool[0].id : null)
  const known = sender.organizer || guests.some(theirs)

  const waiting = (reason: string, suggestedGuestId: string | null): Placement => ({
    kind: 'unmatched',
    reason,
    suggestedGuestId,
  })

  if (!known) {
    if (read.amountCents === null) return { kind: 'rejected', reason: NOT_A_PAYMENT }
    return waiting(FROM_STRANGER, suggest(named))
  }
  if (!sender.verified)
    return waiting(
      'We couldn’t check that it really came from that address.',
      suggest(own.length ? own : named)
    )

  let guest: PlaceGuest
  if (sender.organizer) {
    if (!read.payerName)
      return waiting('You forwarded this, and it doesn’t name the guest who paid.', null)
    if (named.length === 0)
      return waiting(`No guest on this trip is named ${read.payerName}.`, null)
    if (named.length > 1) return waiting(`More than one guest could be ${read.payerName}.`, null)
    guest = named[0]
  } else {
    if (own.length > 1)
      return waiting(
        'It came from someone who looks after several travelers, so say which one it’s for.',
        suggest(named.filter((g) => own.includes(g)))
      )
    if (own.length === 0) return waiting('It came from a guest who was turned down.', null)
    guest = own[0]
    if (!read.payeeName)
      return waiting(
        read.payerName
          ? 'It looks like money they received, not a payment they sent.'
          : 'It doesn’t say who the money went to.',
        guest.id
      )
  }

  if (!canPay(guest, joinMode))
    return waiting(
      guest.status === 'declined'
        ? `${guest.firstName} was turned down.`
        : guest.refundSentAt
          ? `${guest.firstName} was refunded.`
          : joinMode === 'accept_first'
            ? `${guest.firstName} isn’t accepted yet, so they haven’t been shown how to pay.`
            : `${guest.firstName} is on the waitlist and hasn’t been offered a spot.`,
      guest.id
    )
  if (read.amountCents === null) return waiting('We couldn’t tell how much it was for.', guest.id)
  const amount = read.amountCents
  const sentOn = read.sentOn
  const twin = guest.payments.find(
    (p) =>
      p.status !== 'not_received' &&
      p.guestPaymentAmount === amount &&
      (!sentOn || days(p.sentOn, sentOn) <= 3)
  )
  if (twin)
    return waiting(
      `${guest.firstName} already has a ${dollars(amount)} payment from ${shortDay(twin.sentOn)}. It may be the same one.`,
      guest.id
    )
  return { kind: 'guest', guestId: guest.id }
}
