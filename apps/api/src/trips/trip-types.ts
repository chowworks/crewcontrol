// Generated from packages/types/src/index.ts by `npm run sync:types`. Do not edit.

// Shared shapes between the API and the web app. Money is integer cents; calendar dates are 'YYYY-MM-DD'.

export const HIGHLIGHT_ICONS = [
  'home',
  'hotel',
  'beach',
  'plane',
  'ferry',
  'car',
  'food',
  'drink',
  'activity',
  'star',
] as const
export type HighlightIcon = (typeof HIGHLIGHT_ICONS)[number]

export interface TripHighlight {
  title: string
  detail: string
  icon: HighlightIcon
}

export interface TripPhoto {
  url: string
  caption: string
}

export interface TripKeyDate {
  date: string
  label: string
}

/** How a trip takes its crew once guests have signed: the organizer accepts each one and then they pay
 * (accept_first), they pay and then the organizer accepts each one (pay_first), or they pay and confirming a payment
 * accepts them while spots are left (first_come). */
export type JoinMode = 'accept_first' | 'pay_first' | 'first_come'

/**
 * How refunds work when a guest drops out after they're accepted, as the trip agreement words it. Presets only, never
 * free text (owner's decision, 2026-10-26): 'spot_filled' gives money back only if the organizer fills the spot, as
 * much as the new guest pays; 'first_payment_kept' keeps the first payment and treats the rest as 'spot_filled'.
 */
export type RefundPolicy = 'spot_filled' | 'first_payment_kept'

/** What a guest sees on the public trip page. Never carries payment instructions or contact details. */
export interface PublicTrip {
  slug: string
  name: string
  destination: string
  startDate: string
  endDate: string
  organizerName: string
  description: string
  costPerPersonCents: number
  installmentCount: number
  /** The first photo is the cover; the rest fill the gallery. */
  photos: TripPhoto[]
  galleryTitle: string
  highlights: TripHighlight[]
  keyDates: TripKeyDate[]
  goingCount: number
  interestedCount: number
  /** Approved guests as "First L.", or null when the organizer hides names. */
  guestNames: string[] | null
  /** A demo trip from the seed, shown with a "Sample Trip" badge. */
  isSample: boolean
  maxGuests: number | null
  joinMode: JoinMode
  /** The trip agreement quotes it, so the join page needs it (terms, not anything private). */
  refundPolicy: RefundPolicy
  /** Rooms guests can ask for, with how many places are still open; empty unless room choice is on. */
  rooms: PublicRoom[]
  /** Room choice, whether a room is required, and the lines beside the sign-up button. */
  options: TripOptions
  /** Spots taken against maxGuests: accepted guests. */
  spotsTaken: number
  /** Someone joining now goes on the waitlist: the trip is full (or, where guests pay first, enough people can pay). */
  waitlisting: boolean
}

/** Joining, then accepted, or turned down by the organizer. */
export type GuestStatus = 'interested' | 'approved' | 'declined'

/** A person's part in running a trip (TripMember.role): the owner decides who else organizes it. */
export type TripRole = 'owner' | 'organizer'

export interface Guest {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  status: GuestStatus
  /** ISO times: joined; when confirmed payments first covered the first payment due (the spot is paid); refund sent. */
  createdAt: string
  spotPaidAt: string | null
  refundSentAt: string | null
  /** When they joined onto the waitlist (the trip was full), and when an organizer offered them a spot. */
  waitlistedAt: string | null
  offeredAt: string | null
  /** Every payment they reported or the organizer logged, oldest first. */
  payments: Payment[]
  roomId: string | null
  /** Who they'd like to share with, in their words. */
  roomNote: string
  /** When they signed the trip agreement, or null if they haven't (guests from before signing). */
  signedAt: string | null
  /** The terms their signed agreement quoted, which their balance uses; null if unsigned. */
  terms: GuestTerms | null
}

/** What a guest's signed agreement holds them and the organizer to. Trip changes after signing never touch it. */
export interface GuestTerms {
  priceCents: number
  installmentCount: number
  startDate: string
  endDate: string
  refundTerms: string
  /** The first installment, which holds the spot. */
  firstInstallmentCents: number
  /** What the organizer has confirmed arrived, in all. */
  paidCents: number
  /** Reported by the guest, waiting for the organizer. */
  pendingCents: number
  /** What is left to pay: the price less the payments the organizer has confirmed. */
  balanceCents: number
}

/** The ways guests can pay an organizer that Travel HQ knows by name, and a free-form one ("Pay in person"). */
export const PAYMENT_METHOD_KINDS = [
  { kind: 'cashapp', name: 'Cash App', handle: '$cashtag or phone number' },
  { kind: 'zelle', name: 'Zelle', handle: 'Phone number or email' },
  { kind: 'venmo', name: 'Venmo', handle: '@username' },
  { kind: 'paypal', name: 'PayPal', handle: 'Phone number, email or @username' },
  { kind: 'applecash', name: 'Apple Cash', handle: 'Phone number or email' },
  {
    kind: 'custom',
    name: 'Something else',
    handle: 'How to pay, for example "Hand it to me at dinner"',
  },
] as const
export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number]['kind']

/** One way to pay the organizer, as they listed it on the trip. */
export interface PaymentMethod {
  kind: PaymentMethodKind
  /** For a custom method only: its name ("Pay in person"). */
  label: string
  /** The handle (a $cashtag, phone, email or @username), or for a custom method how to do it. */
  handle: string
}

/** A payment method in one line: "Zelle · (555) 010-0199", "Pay in person · Hand it to me at dinner". */
export function paymentMethodLabel(m: PaymentMethod): string {
  const name =
    m.kind === 'custom'
      ? m.label.trim() || 'Other'
      : (PAYMENT_METHOD_KINDS.find((k) => k.kind === m.kind)?.name ?? 'Other')
  return m.handle.trim() ? `${name} · ${m.handle.trim()}` : name
}

/** One payment a guest sent the organizer, for any installment. Amounts are whole cents. */
export interface Payment {
  id: string
  /** What the guest says they sent. */
  guestPaymentAmount: number
  /** What the organizer confirmed arrived; null until they do. */
  receivedPaymentAmount: number | null
  /** How it was paid, as picked ("Zelle · (555) 010-0199"). */
  method: string
  methodKind: PaymentMethodKind | 'other'
  /** 'YYYY-MM-DD', the day the guest says they sent it. */
  sentOn: string
  /** Why it was less than due, in the guest's words. */
  note: string
  status: 'reported' | 'confirmed' | 'not_received' | 'refunded'
  loggedBy: 'guest' | 'organizer'
  reportedAt: string
  decidedAt: string | null
}

/** A guest reporting a payment from their join page. */
export interface PaymentReport {
  guestPaymentAmount: number
  /** Which of the trip's payment methods, by position; null when the trip lists none (its note says how). */
  methodIndex: number | null
  sentOn: string
  /** Required when the amount is less than due now. */
  note: string
  /** "I sent this payment": the guest certifies it. */
  certified: boolean
}

/** The organizer's decision on a reported payment: it arrived (with how much), it didn't, or undo the decision. */
export interface PaymentDecision {
  status: 'confirmed' | 'not_received' | 'reported'
  /** With confirmed: what arrived. Left out, it is what the guest said they sent. */
  receivedPaymentAmount?: number
}

/** The organizer logging a payment handed over in person: it is confirmed as it is logged. */
export interface PaymentLog {
  receivedPaymentAmount: number
  method: string
  sentOn: string
  note: string
}

/** A signed agreement, as the guest who signed it and the trip's organizers see it. */
export interface SignedAgreement {
  text: string
  /** SHA-256 of the text, hex. */
  textHash: string
  templateVersion: string
  typedName: string
  signedAt: string
  ipAddress: string
  userAgent: string
}

/** One line of a guest's history in Trip Control, oldest first. The database writes these; nobody edits them. */
export interface GuestEvent {
  at: string
  kind:
    | 'joined'
    | 'waitlisted'
    | 'offered'
    | 'signed'
    | 'said_paid'
    | 'payment_confirmed'
    | 'payment_not_received'
    | 'payment_undone'
    | 'accepted'
    | 'turned_down'
    | 'put_back'
    | 'refund_sent'
    | 'refund_undone'
    | 'room_changed'
    | 'contact_changed'
  /** Who did it: the guest, one of the trip's organizers, or Travel HQ itself (a sample trip's setup). */
  actor: 'guest' | 'organizer' | 'system'
  /** For room_changed: the rooms' names, null for no room or a room since removed. */
  fromRoom: string | null
  toRoom: string | null
  /** For contact_changed: which details changed, never their values. */
  fields: ('name' | 'email' | 'phone')[]
  /** For the payment kinds: what the guest said they sent, or with payment_confirmed what arrived (whole cents). */
  amount: number | null
}

/**
 * One line of the trip log in Trip Control, newest first: a join refused because the email is already on the trip
 * (what was typed, from where, and whether it hit the limit of three every ten minutes), the admin seating
 * themselves on or opening the trip, or a line of a guest's history.
 */
export type TripLogEntry =
  | {
      kind: 'email_refused'
      at: string
      name: string
      email: string
      phone: string
      ipAddress: string
      userAgent: string
      blocked: boolean
    }
  | { kind: 'admin'; at: string; action: 'insert' | 'update' | 'delete' | 'open' }
  | { kind: 'guest'; at: string; guestId: string; guestName: string; event: GuestEvent }

/** The editable fields of a trip. Saving replaces the photo, highlight and key date lists whole. */
/**
 * Trip settings that only change what the pages show, kept together in one field (Trip.options) so a new one needs
 * no database change. A setting the database must enforce (the join mode) stays its own column.
 */
export interface TripOptions {
  /** Guests pick a room when they sign up, from the trip's rooms. */
  roomChoice: boolean
  /** With roomChoice: a guest can't sign up without picking a room. */
  roomRequired: boolean
  /** A few lines guests read beside the sign-up button. */
  signupNote: string
}

export const DEFAULT_TRIP_OPTIONS: TripOptions = {
  roomChoice: false,
  roomRequired: false,
  signupNote: '',
}

export interface TripInput {
  name: string
  destination: string
  startDate: string
  endDate: string
  organizerName: string
  description: string
  costPerPersonCents: number
  installmentCount: number
  galleryTitle: string
  showGuestNames: boolean
  /** How guests can pay the organizer; a guest picks one when they report a payment. */
  paymentMethods: PaymentMethod[]
  /** Anything else about paying, beside the methods. */
  paymentInstructions: string
  published: boolean
  photos: TripPhoto[]
  highlights: TripHighlight[]
  keyDates: TripKeyDate[]
  /** The most guests the trip takes; null for no limit. */
  maxGuests: number | null
  joinMode: JoinMode
  refundPolicy: RefundPolicy
  options: TripOptions
}

export interface OrganizerTrip extends TripInput {
  id: string
  slug: string
  guests: Guest[]
  /** The system's waitlist buffer (System Settings), so Trip Control can tell when a spot opened as the database does. */
  waitlistBufferPercent: number
  updatedAt: string
}

export interface TripSummary {
  id: string
  slug: string
  name: string
  destination: string
  startDate: string
  endDate: string
  published: boolean
  coverUrl: string | null
  isSample: boolean
}

export const MAX_TRIP_PHOTOS = 15

// The contact form (POST /api/contact). `?topic=` on /contact prefills one of these.
export const CONTACT_TOPICS = [
  'question',
  'trip-help',
  'app-problem',
  'privacy',
  'feedback',
] as const
export type ContactTopic = (typeof CONTACT_TOPICS)[number]
export const CONTACT_TOPIC_LABELS: Record<ContactTopic, string> = {
  question: 'A question about Travel HQ',
  'trip-help': 'Help with a trip',
  'app-problem': 'App Problem / Navigation Issue',
  privacy: 'Privacy or my data',
  feedback: 'Feedback or an idea',
}

export interface ContactInput {
  name: string
  email: string
  topic: ContactTopic
  message: string
  /** Honeypot: hidden from people, so only a bot fills it in. */
  website?: string
}

/** A room or sleeping space on a trip: who fits, and how its share of the price is weighted. */
export interface TripRoom {
  /** Set once saved; keep it when editing so guests' choices stay attached. */
  id?: string
  name: string
  /** What's in it, like "King, private bath". */
  beds: string
  capacity: number
  /** Pricing weight relative to the other rooms; 1 is the baseline. */
  weight: number
  /** The beds, in order, for the room's picture. */
  bedTypes: BedType[]
  /** The fewest people the room is priced for; fewer than this pay for the empty places too. */
  minPeople: number
}

export const BED_TYPES = ['king', 'queen', 'double', 'twin', 'daybed', 'sofa-bed', 'bunk'] as const
export type BedType = (typeof BED_TYPES)[number]
export const BED_LABELS: Record<BedType, { label: string; sleeps: number }> = {
  king: { label: 'King', sleeps: 2 },
  queen: { label: 'Queen', sleeps: 2 },
  double: { label: 'Double', sleeps: 2 },
  twin: { label: 'Twin', sleeps: 1 },
  daybed: { label: 'Daybed', sleeps: 1 },
  'sofa-bed': { label: 'Pull-out sofa', sleeps: 2 },
  bunk: { label: 'Bunk bed', sleeps: 2 },
}

export const MAX_TRIP_ROOMS = 20

export interface PublicRoom {
  id: string
  name: string
  beds: string
  bedTypes: BedType[]
  capacity: number
  minPeople: number
  spotsLeft: number
}

/** What a signed-in guest sends from the join page: their details, and their signature on the agreement. */
export interface JoinInput {
  name: string
  phone: string
  email: string
  /** Optional: the room they'd like, and who they'd share with. */
  roomId?: string | null
  roomNote?: string
  /** Their full name, typed as their signature. */
  typedName: string
  /** The "I agree" box, unticked until they tick it. */
  agreed: boolean
  /** The SHA-256 of the agreement they were shown, so a trip changed in the meantime is never signed unseen. */
  agreementHash: string
  /**
   * The version of Travel HQ's Terms of Use they ticked, when the join page asked (only someone who hasn't accepted
   * the current version is asked). Refused unless it is the current version.
   */
  termsVersion?: string
  /** The Terms of Use box, ticked; required with `termsVersion`. */
  termsAgreed?: boolean
}

/** The trip agreement as it stands for a trip today, before anyone signs it. */
export interface AgreementPreview {
  text: string
  textHash: string
  templateVersion: string
}

/** The signed-in guest's own place on a trip, as their join page shows it. */
export interface MyGuest {
  status: GuestStatus
  firstName: string
  lastName: string
  spotPaidAt: string | null
  refundSentAt: string | null
  /** On the waitlist, and whether an organizer offered them a spot. */
  waitlistedAt: string | null
  offeredAt: string | null
  roomId: string | null
  terms: GuestTerms | null
  agreement: SignedAgreement | null
  payments: Payment[]
  /**
   * How to pay the organizer: the methods and the note. Only ever sent to a guest who joined (on an accept_first
   * trip, once accepted); empty otherwise.
   */
  paymentMethods: PaymentMethod[]
  paymentInstructions: string
}

/** The join page: the trip, the agreement to sign, and the guest's own place once they've joined. */
export interface JoinView {
  trip: PublicTrip
  agreement: AgreementPreview
  me: MyGuest | null
  /** Where this person stands with Travel HQ's Terms of Use: the join page asks for them if not accepted. */
  termsOfUse: TermsStatus
}

/** The organizer's changes to one guest from the Trip Control panel. */
export interface GuestUpdate {
  /** Accept, turn down, or put back to waiting. */
  status?: GuestStatus
  /** Offer a waitlisted guest the spot that opened (on the pay-first trips; accepting does it on the others). */
  offerSpot?: boolean
  /** Turning down a guest whose payment arrived needs this: the organizer says the refund went out. */
  refundSent?: boolean
  /** Move the guest to a room, or null for no room. */
  roomId?: string | null
}

/**
 * Travel HQ's own documents, apart from any trip agreement: the Terms of Use everyone accepts, and the Organizer
 * Terms anyone who runs a trip accepts as well.
 */
export type TermsKind = 'use' | 'organizer'

export interface TermsSection {
  heading: string
  body: string
}

/** One of Travel HQ's documents. `version` is the fingerprint of its wording: change a word and it changes. */
export interface TermsDocument {
  kind: TermsKind
  title: string
  version: string
  sections: TermsSection[]
}

/** Both documents, as the /terms page and the Terms screens show them. */
export interface PublicTerms {
  use: TermsDocument
  organizer: TermsDocument
}

/** Where the signed-in person stands with one document. */
export interface TermsStatus {
  version: string
  accepted: boolean
  /** They accepted an earlier version, so the screen says the Terms were updated rather than asking for the first time. */
  previouslyAccepted: boolean
}

export interface MyTerms {
  use: TermsStatus
  organizer: TermsStatus
}

/** The versions the person accepts, as shown to them. Accepting the Organizer Terms takes the Terms of Use with it. */
export interface AcceptTermsInput {
  use: string
  organizer?: string
}

/** The code on a 403 from an organizer route while the person hasn't accepted the current Organizer Terms. */
export const TERMS_REQUIRED_CODE = 'terms_required'

/** app-wide values the platform admin sets in the Admin toolbox (System Settings). */
export interface SystemSettings {
  /**
   * On the trips where guests pay before they're accepted, joining goes to the waitlist once the guests who can see
   * how to pay fill the spots left plus this percent of them, rounded up. 0 to 100.
   */
  waitlistBufferPercent: number
}

// ── What needs the organizer ─────────────────────────────────────────────────
// The rules for Trip Control's Actions, shared so the API counts the same things the screen lists (the red count in
// the account menu and on Your trips). The screen adds the words.

/** One thing the organizer does next for a guest. */
export type GuestAction =
  // A payment the guest reported, to confirm (in one tap) or, when it is short of what was due, to review.
  | { kind: 'payment'; key: string; payment: Payment; due: number; short: boolean }
  // A guest ready to accept: signed (and on the pay-first trips, some payment arrived), or next on the waitlist of an
  // accept-first trip with a spot open.
  | { kind: 'accept'; key: string; fromWaitlist: boolean }
  // A spot opened and this guest is next on the waitlist of a pay-first trip: offer it to them.
  | { kind: 'offer'; key: string }
  // Their payment arrived but every spot is taken: they're owed it back.
  | { kind: 'refund'; key: string; paidCents: number }

/** Money the organizer confirmed arrived from a guest (refunded payments don't count). */
export const confirmedCents = (g: Guest): number =>
  g.payments
    .filter((p) => p.status === 'confirmed')
    .reduce((n, p) => n + (p.receivedPaymentAmount ?? 0), 0)

/**
 * What was due when a payment was reported, as the guest saw it then: the first payment, less what they had already
 * reported or had confirmed before this one (payments not received don't count). Zero once the spot was covered.
 */
export function dueWhenSent(payment: Payment, payments: Payment[], terms: GuestTerms): number {
  const before = payments
    .filter((p) => p.reportedAt < payment.reportedAt && p.id !== payment.id)
    .reduce(
      (n, p) =>
        n +
        (p.status === 'confirmed'
          ? (p.receivedPaymentAmount ?? 0)
          : p.status === 'reported'
            ? p.guestPaymentAmount
            : 0),
      0
    )
  return Math.max(0, terms.firstInstallmentCents - before)
}

/** Guests waiting on the waitlist for a spot (not yet offered one), in the order they joined it. */
export function waitlist(guests: Guest[]): Guest[] {
  return guests
    .filter((g) => g.status === 'interested' && g.waitlistedAt && !g.offeredAt)
    .sort((a, b) => a.waitlistedAt!.localeCompare(b.waitlistedAt!))
}

/**
 * Whether someone joining now goes on the waitlist, as the database decides it (trip_waitlisting): every spot taken,
 * or, where guests pay first, the guests who can already see how to pay (waiting, not refunded, not on the waitlist
 * unless offered a spot) fill the spots left plus the system's waitlist buffer (System Settings), rounded up.
 */
export function waitlisting(
  trip: { maxGuests: number | null; joinMode: JoinMode; waitlistBufferPercent: number },
  guests: Guest[]
): boolean {
  if (trip.maxGuests === null) return false
  const spotsLeft = trip.maxGuests - guests.filter((g) => g.status === 'approved').length
  if (spotsLeft <= 0) return true
  if (trip.joinMode === 'accept_first') return false
  const inLine = guests.filter(
    (g) => g.status === 'interested' && !g.refundSentAt && (!g.waitlistedAt || g.offeredAt)
  ).length
  return inLine >= spotsLeft + Math.ceil((spotsLeft * trip.waitlistBufferPercent) / 100)
}

/** Every spot is taken (accepted guests at the limit). */
export const tripFull = (trip: OrganizerTrip): boolean =>
  trip.maxGuests !== null &&
  trip.guests.filter((g) => g.status === 'approved').length >= trip.maxGuests

/** What the organizer does next for one guest, if anything. */
export function guestActions(g: Guest, trip: OrganizerTrip): GuestAction[] {
  if (g.status === 'declined' || !g.signedAt) return []
  const full = tripFull(trip)
  // The waitlist: only the guest next in it, and only once a spot opened (someone joining now wouldn't wait).
  if (g.status === 'interested' && g.waitlistedAt && !g.offeredAt) {
    const next = waitlist(trip.guests)[0]?.id === g.id
    const open = trip.joinMode === 'accept_first' ? !full : !waitlisting(trip, trip.guests)
    if (!next || !open) return []
    return [
      trip.joinMode === 'accept_first'
        ? { kind: 'accept', key: `${g.id}-accept`, fromWaitlist: true }
        : { kind: 'offer', key: `${g.id}-offer` },
    ]
  }
  const payFirst = trip.joinMode !== 'accept_first'
  const paid = confirmedCents(g)
  const out: GuestAction[] = g.payments
    .filter((p) => p.status === 'reported')
    .map((p) => {
      const due = g.terms ? dueWhenSent(p, g.payments, g.terms) : 0
      return { kind: 'payment', key: p.id, payment: p, due, short: p.guestPaymentAmount < due }
    })
  if (g.status !== 'interested') return out
  if (full) {
    if (paid && !g.refundSentAt)
      out.push({ kind: 'refund', key: `${g.id}-refund`, paidCents: paid })
    return out
  }
  if (payFirst && !paid) return out
  out.push({ kind: 'accept', key: `${g.id}-accept`, fromWaitlist: false })
  return out
}

/** Everything that needs the organizer on a trip: the red count beside Actions. */
export const tripActionCount = (trip: OrganizerTrip): number =>
  trip.guests.reduce((n, g) => n + guestActions(g, trip).length, 0)

/** The red count in the account menu: each trip or trip page that needs the signed-in person, and how many things. */
export interface MyActions {
  total: number
  items: {
    /** Where to go: a trip's Trip Control (organizer), or a guest's join page. */
    href: string
    name: string
    count: number
    /** 'organizer' for a trip they run; 'guest' for one they joined (something to pay). */
    as: 'organizer' | 'guest'
  }[]
}

/** An organizer asking for something Travel HQ doesn't do yet (for now, other refund terms). */
export interface OrganizerRequestInput {
  kind: 'refund_terms'
  /** The trip they were setting up, if it's saved. */
  tripId?: string
  text: string
}

/** A request as the Admin toolbox lists it. */
export interface OrganizerRequest {
  id: string
  kind: 'refund_terms'
  /** Who asked, by name (from sign-in), and the trip they were setting up. */
  userName: string
  tripName: string
  text: string
  createdAt: string
}
