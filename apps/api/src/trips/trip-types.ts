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
  /**
   * Email guests this many days before the date (0 is on the day), or no reminder when missing or null. The
   * organizer's settings: never on the public page.
   */
  remindDaysBefore?: number | null
}

/**
 * One of the organizer's own parts of the trip page (issue #85; owner's decisions, 2026-11-15): a title, some text and
 * photos, such as "Getting there". A plain block, never typed fields. `acceptedOnly` keeps it to accepted guests: it
 * never reaches the public page, only an accepted guest's own trip page (JoinView.sections).
 */
export interface TripSection {
  title: string
  body: string
  photos: TripPhoto[]
  acceptedOnly: boolean
}

export const MAX_TRIP_SECTIONS = 6
export const MAX_SECTION_PHOTOS = 6
/** Titles the editor offers to tap when adding a section; tapping one fills in only the title. */
export const SECTION_TITLE_IDEAS = [
  'Transportation',
  'Getting there',
  'What to pack',
  'The area',
] as const

/** The choices for a reminder, in days before its date. */
export const REMIND_DAYS = [0, 1, 3, 7, 14, 30] as const

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
  /**
   * The picture chat apps show when the trip page's link is shared, drawn when the trip is saved: a signed link, the
   * seed's /seed/ path, or null until the trip is next saved (the cover photo stands in).
   */
  previewImage: string | null
  galleryTitle: string
  highlights: TripHighlight[]
  keyDates: TripKeyDate[]
  /** The organizer's sections for everyone; ones for accepted guests only are never here. */
  sections: TripSection[]
  goingCount: number
  interestedCount: number
  /** Approved guests as "First L.", or null when the organizer hides names. */
  guestNames: string[] | null
  /** A demo trip from the seed, shown with a "Sample Trip" badge. */
  isSample: boolean
  maxGuests: number | null
  joinMode: JoinMode
  /** The payment plan the agreement quotes: each installment's amount and due date (terms, not anything private). */
  paymentPlan: PlannedPayment[]
  /** The trip agreement quotes it, so the join page needs it (terms, not anything private). */
  refundPolicy: RefundPolicy
  /** Rooms guests can ask for, with how many places are still open; empty unless room choice is on. */
  rooms: PublicRoom[]
  /** Room choice, whether a room is required, and the lines beside the sign-up button. */
  options: PublicTripOptions
  /** The trip's questions answered for everyone (issue #13), in the organizer's order: never who asked. */
  faq: FaqEntry[]
  /** Spots taken against maxGuests: accepted guests. */
  spotsTaken: number
  /** Save the date (issue #47): the page takes "I'm interested" instead of sign-ups, and nobody can sign yet. */
  saveTheDate: boolean
  /** Someone joining now goes on the waitlist: the trip is full (or, where guests pay first, enough people can pay). */
  waitlisting: boolean
  /** The trip has started on its own clock (issue #88): nobody new can sign up or say they're interested. */
  signupsClosed: boolean
  /** The trip's last day has passed on its own clock (issue #88). */
  ended: boolean
}

/** Joining, then accepted, or turned down by the organizer. */
export type GuestStatus = 'interested' | 'approved' | 'declined'

/** A person's part in running a trip (TripMember.role): the owner decides who else organizes it. */
export type TripRole = 'owner' | 'organizer'

/** Someone who runs a trip, as its People screen lists them (name and email from sign-in). */
export interface TripPerson {
  userId: string
  name: string
  email: string
  role: TripRole
}

/** Someone invited to run a trip who hasn't signed in yet: they join with this role when they do. */
export interface TripInvite {
  email: string
  role: TripRole
}

/** A trip's People screen: who runs it, and whether the viewer may change that (its owners, and the admin). */
export interface TripPeople {
  tripName: string
  isSample: boolean
  canManage: boolean
  people: TripPerson[]
  invites: TripInvite[]
}

/** Adding someone who runs the trip by email; someone who hasn't signed in yet is invited (TripInvite). */
export interface TripPersonInput {
  email: string
  role: TripRole
  /** Email them that they were added (the default); false on Undo, which puts back someone who was already told. */
  notify?: boolean
}

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
  /** The credits and charges the organizer put on their balance, removed ones too, oldest first. */
  adjustments: BalanceAdjustment[]
  roomId: string | null
  /** They have their room to themselves: they paid the upgrade, and nobody else goes in it. */
  wholeRoom: boolean
  /** Who they'd like to share with, in their words. */
  roomNote: string
  /** When they signed the trip agreement, or null if they haven't (guests from before signing). */
  signedAt: string | null
  /**
   * The terms their signed agreement quoted, which their balance uses; null if unsigned. An organizer going on their own
   * trip signs nothing: theirs are a $0 price, so their balance is the charges an organizer adds.
   */
  terms: GuestTerms | null
  /** An organizer of the trip who said "I'm going too" (issue #53): accepted at once, with no trip agreement. */
  organizer: boolean
  /** Whether they have an account of their own (signed in to join, or took over a sign-up made for them). */
  hasAccount: boolean
  /**
   * Who signed them up and looks after them, when it wasn't them (a parent, a friend paying for a roommate): the guest
   * on this trip with that account, if they're on it, and the name to show. Null when they look after themselves.
   */
  managedBy: { guestId: string | null; name: string } | null
  /** Emails to them bounced, or they marked one as spam (Resend tells the API); null when nothing's wrong. */
  emailProblem: 'bounced' | 'complained' | null
  /**
   * What their room costs beyond the price they signed, not yet settled (issue #30): above zero their room costs
   * more, below zero less. The organizer settles it as a charge or credit, or leaves it; nothing changes on its own.
   */
  roomPriceDiffCents: number
}

/** What a guest's signed agreement holds them and the organizer to. Trip changes after signing never touch it. */
export interface GuestTerms {
  priceCents: number
  installmentCount: number
  startDate: string
  endDate: string
  refundTerms: string
  /** The first installment, which holds the spot: never more than the price with adjustments. */
  firstInstallmentCents: number
  /** What the organizer has confirmed arrived, in all. */
  paidCents: number
  /** Reported by the guest, waiting for the organizer. */
  pendingCents: number
  /** The organizer's adjustments that still count: charges less credits (below zero when credits are more). */
  adjustmentCents: number
  /** What is left to pay: the price, plus the adjustments, less the payments the organizer has confirmed. */
  balanceCents: number
  /**
   * The payment plan they signed, one line per installment: its amount and, when the trip had set them, its due date.
   * Agreements signed before plans had dates have none.
   */
  schedule: PlannedPayment[]
}

/** One installment of a payment plan. Amounts add up to the price; credits and charges are apart from them. */
export interface PlannedPayment {
  dueOn: string | null
  amountCents: number
}

/**
 * A trip's payment plan for a price: `count` installments, the first `firstPaymentCents` when the organizer set one
 * (never more than the price) or an even share, the rest split evenly, each with its due date when the trip has them.
 * Shares are whole dollars, with what's left over on the last payment (owner's decision, 2026-10-29: nobody sends
 * $466.66). With `shares` (a custom plan, issue #65: one number per installment), each installment is its share of the
 * price; shares that add up to the price are the amounts themselves. The agreement quotes it and the signature keeps it.
 */
export function paymentPlan(
  priceCents: number,
  count: number,
  firstPaymentCents: number | null,
  dueDates: string[],
  shares: number[] | null = null
): PlannedPayment[] {
  const n = Math.max(1, Math.floor(count))
  const due = (i: number) => dueDates[i] ?? null
  if (n === 1) return [{ dueOn: due(0), amountCents: priceCents }]
  const dollars = (cents: number) => Math.floor(cents / 100) * 100
  const total = shares?.length === n ? shares.reduce((a, b) => a + b, 0) : 0
  if (shares && total > 0) {
    const amounts = shares.map((s) =>
      total === priceCents ? s : dollars((priceCents * s) / total)
    )
    const rest = priceCents - amounts.slice(0, -1).reduce((a, b) => a + b, 0)
    return amounts.map((a, i) => ({ dueOn: due(i), amountCents: i === n - 1 ? rest : a }))
  }
  const first = Math.min(priceCents, firstPaymentCents ?? dollars(priceCents / n))
  const each = dollars((priceCents - first) / (n - 1))
  return Array.from({ length: n }, (_, i) => ({
    dueOn: due(i),
    amountCents: i === 0 ? first : i === n - 1 ? priceCents - first - each * (n - 2) : each,
  }))
}

/**
 * A credit or charge the organizer put on a guest's balance by hand, with a reason (issue #17): "$50 off for driving
 * the van", "$40 for the extra night". Not a payment, and it never touches the signed price. Never edited: removing
 * it keeps it, marked removed, and it no longer counts.
 */
export interface BalanceAdjustment {
  id: string
  kind: 'credit' | 'charge'
  amountCents: number
  reason: string
  createdAt: string
  removedAt: string | null
}

/** The organizer adding a credit or charge to a guest's balance. */
export interface BalanceAdjustmentInput {
  kind: 'credit' | 'charge'
  amountCents: number
  reason: string
}

/** What a guest owes in all: their signed price with the adjustments that count. */
export const totalDueCents = (terms: GuestTerms): number => terms.priceCents + terms.adjustmentCents

/**
 * A guest's signed plan with its due dates: the ones their agreement quoted, or, when it quoted none, the trip's
 * current ones for the same number of payments (the rule reminders follow, so the page, the emails and the reminders
 * agree). The amounts are always the signed ones.
 */
export function datedSchedule(
  terms: GuestTerms,
  tripDueDates: (string | null)[]
): PlannedPayment[] {
  const signed = terms.schedule
  if (signed.every((p) => p.dueOn)) return signed
  return tripDueDates.length === signed.length && tripDueDates.every(Boolean)
    ? signed.map((p, i) => ({ ...p, dueOn: tripDueDates[i] }))
    : signed
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
  /** 'email': read from a receipt someone forwarded to the trip's receipts address; still the guest's word. */
  loggedBy: 'guest' | 'organizer' | 'email'
  /** Who sent it, by name, when someone paid for this traveler; '' when the traveler reported it themselves. */
  paidByName: string
  /** One transfer for several travelers: their payments share this and are decided together. Null for one person. */
  transferId: string | null
  reportedAt: string
  decidedAt: string | null
  /** With 'not_received': why it didn't arrive, in the organizer's words; '' when they gave none. The guest sees it. */
  decisionNote: string
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
  /**
   * Who one payment covers, when it covers more than the payer (themselves and the travelers they look after), with
   * each one's share. The shares add up to `guestPaymentAmount`. Left out, it is all for the payer.
   */
  forGuests?: { guestId: string; amount: number }[]
}

/** The organizer's decision on a reported payment: it arrived (with how much), it didn't, or undo the decision. */
export interface PaymentDecision {
  status: 'confirmed' | 'not_received' | 'reported'
  /** With confirmed: what arrived. Left out, it is what the guest said they sent. */
  receivedPaymentAmount?: number
  /** With confirmed, on a transfer for several travelers: what arrived for each, by payment. Left out, as reported. */
  shares?: { paymentId: string; receivedPaymentAmount: number }[]
  /** With not_received: why, optional, at most 200 characters. The guest is emailed it a minute later. */
  note?: string
}

/** The organizer logging a payment handed over in person: it is confirmed as it is logged. */
export interface PaymentLog {
  receivedPaymentAmount: number
  method: string
  sentOn: string
  note: string
}

/**
 * Money the organizer pays out for the trip (the house, the resort, a chef), recorded only: Travel HQ never moves it.
 * Paid once it has a paid date; until then it is still owed, by its due date if it has one. Organizers only.
 */
export interface Expense {
  id: string
  /** Who gets paid ("Seaside Rentals"). */
  payee: string
  /** What it's for ("House deposit"). */
  description: string
  amountCents: number
  /** 'YYYY-MM-DD', the day it was paid; null while it is still owed. */
  paidOn: string | null
  /** 'YYYY-MM-DD', when it is due; optional. */
  dueOn: string | null
  createdAt: string
}

/** What the organizer types to add or change an expense. */
export type ExpenseInput = Pick<
  Expense,
  'payee' | 'description' | 'amountCents' | 'paidOn' | 'dueOn'
>

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
    | 'offer_withdrawn'
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
    | 'credit_added'
    | 'charge_added'
    | 'credit_removed'
    | 'charge_removed'
  /** Who did it: the guest, one of the trip's organizers, or Travel HQ itself (a sample trip's setup). */
  actor: 'guest' | 'organizer' | 'system'
  /** For room_changed: the rooms' names, null for no room or a room since removed. */
  fromRoom: string | null
  toRoom: string | null
  /** For contact_changed: which details changed, never their values. */
  fields: ('name' | 'email' | 'phone')[]
  /**
   * For the payment kinds: what the guest said they sent, or with payment_confirmed what arrived (whole cents). For the
   * adjustment kinds, the adjustment's amount.
   */
  amount: number | null
  /** For the adjustment kinds: the organizer's reason, and the organizer's name. */
  reason: string | null
  byName: string | null
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
  | {
      /** A change to who runs the trip (an owner's or the admin's), or the admin opening it. */
      kind: 'people'
      at: string
      action: 'insert' | 'update' | 'delete' | 'open'
      /** The admin did it: the log says "An admin", not their name. */
      byAdmin: boolean
      actorName: string
      subjectName: string
      /** They changed their own place (stepped down, or the admin added itself). */
      self: boolean
      role: TripRole | null
      oldRole: TripRole | null
    }
  | { kind: 'guest'; at: string; guestId: string; guestName: string; event: GuestEvent }
  | {
      /**
       * A question on the trip page (issue #13): asked by someone, answered (for everyone or the asker only), or added
       * by an organizer. Kept with the question, so one deleted leaves the log too.
       */
      kind: 'question'
      at: string
      action: 'asked' | 'answered' | 'added'
      /** Who asked, or who answered or added it. */
      name: string
      askerName: string | null
      question: string
      status: QuestionStatus
    }
  | {
      /** A guest's trip change request (issue #82): asked, or closed as done or not possible. */
      kind: 'change_request'
      at: string
      action: 'asked' | 'done' | 'declined'
      /** Who asked, or who closed it. */
      name: string
      guestName: string
      request: string
    }
  | {
      /**
       * Something an organizer changed (owner's decision, 2026-11-01): so each owner sees what the others did. Each
       * save is one line; the trip log shows one person's editor saves close together as one.
       */
      kind: 'change'
      at: string
      /** The admin did it: the log says "An admin", not their name. */
      byAdmin: boolean
      actorName: string
      change: TripChange
    }

/** The parts of a trip the editor saves, as the trip log names them. */
export type TripChangeField =
  | 'name'
  | 'dates'
  | 'price'
  | 'spots'
  | 'joinMode'
  | 'refundPolicy'
  | 'paymentPlan'
  | 'published'
  | 'link'
  | 'destination'
  | 'host'
  | 'description'
  | 'photos'
  | 'photoTitle'
  | 'highlights'
  | 'keyDates'
  | 'sections'
  | 'guestNames'
  | 'paymentMethods'
  | 'paymentInstructions'
  | 'reminders'
  | 'saveTheDate'
  | 'timeZone'
  | 'roomChoice'
  | 'signupNote'
  | 'vendorCosts'
  /** Older log lines only: how rooms were priced before the cost split replaced it (issue #65). */
  | 'roomPricing'
  | 'costSplit'
  | 'ownPart'
  | 'confirmReceipts'

/** One part of the trip that changed, with what it said before and after in plain words when that is short. */
export interface TripFieldChange {
  field: TripChangeField
  from?: string
  to?: string
}

/**
 * What one organizer action changed, written in plain words when it happened, so a line reads the same after later
 * edits. Never shown to guests.
 */
export type TripChange =
  | { what: 'trip'; fields: TripFieldChange[] }
  | {
      what: 'rooms'
      added: string[]
      removed: string[]
      renamed: { from: string; to: string }[]
      prices: { room: string; from: string; to: string }[]
      /** Beds, sizes or the order changed too. */
      other: boolean
    }
  | { what: 'announcement'; action: 'posted' | 'deleted'; text: string }
  | { what: 'invite'; action: 'sent' | 'role' | 'cancelled'; email: string; role: TripRole }
  | { what: 'expense'; action: 'added' | 'changed' | 'removed'; payee: string; amount: string }
  | { what: 'interest_removed'; name: string }
  | { what: 'signups_opened'; emailed: number }
  | { what: 'question'; action: 'edited' | 'deleted'; question: string }
  | { what: 'trip_deleted' }
  | { what: 'trip_restored' }
  /** The room planner applied (issue #93): who moved, by name. */
  | { what: 'rooms_applied'; moved: string[]; grown?: { room: string; from: number; to: number }[] }

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
  /** Trip Financials tracks what the organizer pays vendors (issue #16). Organizer-only: never on a guest's page. */
  vendorCosts: boolean
  /**
   * How the trip splits its cost (issue #65; owner's decisions, 2026-11-01): the vendor costs split evenly among the
   * guests, a price per person on each room, or a price the organizer types. Organizer-only.
   */
  costSplit: CostSplit
  /** With an even split or price by room: what the organizer puts in themselves, off the top of the cost. Organizer-only. */
  ownPartCents: number
  /** With an even split: how many guests share the rest; null for the guest limit (less the organizer's spot). */
  splitGuests: number | null
  /**
   * A guest's forwarded receipt that names its guest is confirmed as it arrives; off, it waits in Actions for the
   * organizer to confirm (owner's decision, 2026-10-29: it's about how much the organizer trusts the crew). An
   * organizer's own forward is always confirmed. Organizer-only.
   */
  confirmReceipts: boolean
}

export type CostSplit = 'even' | 'room' | 'set'

/** What the organizer puts in themselves: an even split or price by room (issue #65); "I know the price" has none. */
export const ownPartOf = (options: Pick<TripOptions, 'costSplit' | 'ownPartCents'>) =>
  options.costSplit === 'even' || options.costSplit === 'room' ? options.ownPartCents : 0

export const DEFAULT_TRIP_OPTIONS: TripOptions = {
  roomChoice: false,
  roomRequired: false,
  signupNote: '',
  vendorCosts: false,
  costSplit: 'even',
  ownPartCents: 0,
  splitGuests: null,
  confirmReceipts: false,
}

/** The options a guest's page sees: the organizer-only ones left out. */
export type PublicTripOptions = Omit<
  TripOptions,
  'vendorCosts' | 'costSplit' | 'ownPartCents' | 'splitGuests' | 'confirmReceipts'
>

export interface TripInput {
  name: string
  destination: string
  startDate: string
  endDate: string
  organizerName: string
  description: string
  costPerPersonCents: number
  installmentCount: number
  /**
   * When each installment is due ('YYYY-MM-DD', one per installment, in order), or empty when the organizer hasn't
   * set them. Payment reminders go out from these.
   */
  paymentDueDates: string[]
  /** Email guests who still owe this many days before each due date (REMIND_DAYS), or null for no payment reminders. */
  paymentReminderDays: number | null
  /** The first payment, which holds the spot, when the organizer sets it; null splits the price evenly. */
  firstPaymentCents: number | null
  /**
   * A custom plan (issue #65): each installment's share of the price, one per installment, or null. Dollars in cents
   * when every guest pays one price (they add up to it), hundredths of a percent when rooms are priced apart.
   */
  paymentShares: number[] | null
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
  /** The organizer's own sections, in order (issue #85). Their photos count toward MAX_TRIP_PHOTOS with the trip's. */
  sections: TripSection[]
  /** The most guests the trip takes; null for no limit. */
  maxGuests: number | null
  joinMode: JoinMode
  refundPolicy: RefundPolicy
  options: TripOptions
  /**
   * Save the date (issue #47; owner's decisions, 2026-10-31): the trip page shows "I'm interested" instead of "I want to
   * join", and nobody can sign. Turning it off opens sign-ups.
   */
  saveTheDate: boolean
  /**
   * The trip's own clock, as an IANA time zone ("America/New_York"): sign-ups close at midnight there on the first day
   * (issue #88; owner's decision, 2026-11-15).
   */
  timeZone: string
}

export interface OrganizerTrip extends TripInput {
  id: string
  slug: string
  guests: Guest[]
  /** The trip's address for forwarded receipts, and the ones waiting for an organizer to match. */
  receipts: TripReceipts
  /** The system's waitlist buffer (System Settings), so Trip Control can tell when a spot opened as the database does. */
  waitlistBufferPercent: number
  /** Guests' questions nobody has answered yet (issue #13): each is one of Trip Control's Actions. */
  questionsWaiting: number
  /** The ids of guests' trip change requests still open (issue #82): each is one of Trip Control's Actions. */
  changeRequestsOpen: string[]
  /** The guest row of the organizer looking at Trip Control, if they're on the trip (issue #53). */
  myGuestId: string | null
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
  /** The trip's last day has passed on its own clock (issue #88): Your trips lists it under Past trips. */
  ended: boolean
}

/** A trip with no time zone of its own counts on this clock. */
export const DEFAULT_TIME_ZONE = 'America/New_York'

/** Whether `timeZone` is a time zone this runtime knows. */
export function knownTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

/** Today ('YYYY-MM-DD') on the trip's own clock (issue #88). */
export function tripToday(timeZone: string, now = new Date()): string {
  const zone = knownTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE
  // en-CA writes a date as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** The trip's first day has come on its own clock: sign-ups are closed for good (owner's decision, 2026-11-15). */
export const tripStarted = (
  trip: { startDate: string; timeZone: string },
  now = new Date()
): boolean => tripToday(trip.timeZone, now) >= trip.startDate

/** The trip's last day has passed on its own clock. */
export const tripEnded = (trip: { endDate: string; timeZone: string }, now = new Date()): boolean =>
  tripToday(trip.timeZone, now) > trip.endDate

/** Photos on a trip, its sections' photos included (owner's decision, 2026-11-15, up from 15). */
export const MAX_TRIP_PHOTOS = 50

// The contact form (POST /api/contact). `?topic=` on /contact prefills one of these.
export const CONTACT_TOPICS = [
  'question',
  'trip-help',
  'app-problem',
  'privacy',
  'feature',
  'feedback',
] as const
export type ContactTopic = (typeof CONTACT_TOPICS)[number]
export const CONTACT_TOPIC_LABELS: Record<ContactTopic, string> = {
  question: 'A question about Travel HQ',
  'trip-help': 'Help with a trip',
  'app-problem': 'App Problem / Navigation Issue',
  privacy: 'Privacy or my data',
  feature: 'Request a feature',
  feedback: 'Other feedback',
}

/** The public early access form on the limited preview page. `website` is the honeypot, as on the contact form. */
export interface EarlyAccessInput {
  name: string
  email: string
  note: string
  website?: string
}

export interface ContactInput {
  name: string
  email: string
  topic: ContactTopic
  message: string
  /** Honeypot: hidden from people, so only a bot fills it in. */
  website?: string
}

/** A room or sleeping space on a trip: who fits it, and its price when the trip prices by room. */
export interface TripRoom {
  /** Set once saved; keep it when editing so guests' choices stay attached. */
  id?: string
  name: string
  /** What's in it, like "King, private bath". */
  beds: string
  capacity: number
  /** The beds, in order, for the room's picture. */
  bedTypes: BedType[]
  /** The fewest people the room is priced for; fewer than this pay for the empty places too. */
  minPeople: number
  /** What a guest in this room pays, per person (issue #30); null or left out: the trip's price. */
  priceCents?: number | null
  /**
   * What a guest pays on top of the room's price to have it to themselves (owner's decision, 2026-11-21). Only a room
   * that sleeps 2 offers it; null or left out: not offered.
   */
  wholeRoomExtraCents?: number | null
}

/** Whether a room offers "room to myself": it sleeps 2 and the organizer priced the upgrade. */
export const offersWholeRoom = (room: { capacity: number; wholeRoomExtraCents?: number | null }) =>
  room.capacity === 2 && (room.wholeRoomExtraCents ?? 0) > 0

/** What a guest in a room pays: its own price, or the trip's when it has none. */
export const roomPrice = (room: { priceCents?: number | null } | undefined, tripCents: number) =>
  room?.priceCents ?? tripCents

/**
 * Whether any room costs something other than the trip's price. Then guests must pick a room when they join, so they
 * sign the price of the room they'll be in (owner's decision, 2026-10-29).
 */
export const roomsPricedApart = (rooms: { priceCents?: number | null }[], tripCents: number) =>
  rooms.some((r) => roomPrice(r, tripCents) !== tripCents)

export const ROOMS_PRICED_APART =
  'Rooms with their own prices need guests to pick a room when they join, so they sign the price of the room they’ll be in.'

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
  /** What a guest who picks it pays, per person, and the trip's payment plan at that price (issue #30). */
  priceCents: number
  paymentPlan: PlannedPayment[]
  /**
   * "Room to myself" (owner's decision, 2026-11-21): what it adds to the price, and the plan at that price, while the
   * room offers it and nobody is in it yet; null otherwise.
   */
  wholeRoom: { extraCents: number; paymentPlan: PlannedPayment[] } | null
}

/** What a signed-in guest sends from the join page: their details, and their signature on the agreement. */
export interface JoinInput {
  name: string
  phone: string
  email: string
  /** Optional: the room they'd like, and who they'd share with. */
  roomId?: string | null
  roomNote?: string
  /** They take the room to themselves, at its upgraded price. */
  wholeRoom?: boolean
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
  /**
   * Signing up someone else (a child, a roommate) whom the signer looks after: the name, phone and email are the
   * traveler's (theirs or the signer's), the typed name is the signer's, and they sign the agreement on the
   * traveler's behalf (`JoinView.agreementOnBehalf`).
   */
  onBehalf?: boolean
}

/** Taking over the place someone signed you up with: the Terms of Use, when the join page asked for them. */
export interface ClaimInput {
  termsVersion?: string
  termsAgreed?: boolean
}

/** Where the on-behalf agreement names the person signing and the traveler, filled in as they type them. */
export const AGREEMENT_SIGNER = '[[signer]]'
export const AGREEMENT_TRAVELER = '[[traveler]]'

/**
 * The on-behalf agreement with both names in it (owner's decision, 2026-10-28), as the screen shows it and as it's
 * kept once signed: the same function on both sides, so what's kept is what was shown. A name not typed yet shows as
 * `blank`.
 */
export function fillAgreementNames(
  text: string,
  signer: string,
  traveler: string,
  blank = { signer: '[your full name]', traveler: '[their full name]' }
): string {
  const tidy = (name: string, empty: string) => name.trim().replace(/\s+/g, ' ') || empty
  return text
    .split(AGREEMENT_SIGNER)
    .join(tidy(signer, blank.signer))
    .split(AGREEMENT_TRAVELER)
    .join(tidy(traveler, blank.traveler))
}

/** The trip agreement as it stands for a trip today, before anyone signs it. */
export interface AgreementPreview {
  text: string
  textHash: string
  templateVersion: string
}

/** The signed-in guest's own place on a trip, as their join page shows it. */
export interface MyGuest {
  id: string
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
  /** The credits and charges that count on their balance, with the organizer's reasons, oldest first. */
  adjustments: BalanceAdjustment[]
  /**
   * How to pay the organizer: the methods and the note. Only ever sent to a guest who joined (on an accept_first
   * trip, once accepted); empty otherwise.
   */
  paymentMethods: PaymentMethod[]
  paymentInstructions: string
  /** Where to forward a payment receipt (the trip's receipts address), under the same rule; null when there's none. */
  receiptsEmail: string | null
}

/** The join page: the trip, the agreement to sign, and the guest's own place once they've joined. */
export interface JoinView {
  trip: PublicTrip
  agreement: AgreementPreview
  me: MyGuest | null
  /**
   * The agreement as someone signs it on behalf of a traveler they look after, with AGREEMENT_SIGNER and
   * AGREEMENT_TRAVELER where the names go (fillAgreementNames); its fingerprint is of this text, before the names.
   */
  agreementOnBehalf: AgreementPreview
  /** The travelers this person signed up and looks after on this trip, in the order they signed them up. */
  managed: MyGuest[]
  /**
   * Someone signed this person up with one of their emails and they haven't joined themselves: who signed (the name
   * they typed). Saying "That's me" takes over that place (ClaimInput).
   */
  claimable: { signedBy: string } | null
  /** Where this person stands with Travel HQ's Terms of Use: the join page asks for them if not accepted. */
  termsOfUse: TermsStatus
  /**
   * The agreement for each room priced apart from the trip (issue #30): picking it, the guest signs its price. Rooms
   * not listed take `agreement` (and `agreementOnBehalf`).
   */
  roomAgreements: {
    roomId: string
    /** The agreement at the room's "room to myself" price. */
    wholeRoom?: boolean
    agreement: AgreementPreview
    agreementOnBehalf: AgreementPreview
  }[]
  /**
   * Who's already in each room, as "First L.", accepted guests only: the room picker shows it so guests can see who
   * they'd share with. Only here, for a signed-in guest, never on the public trip page.
   */
  roomGuests: { roomId: string; names: string[] }[]
  /**
   * Every section of the trip, those for accepted guests only included, when the caller (or a traveler they look
   * after) is accepted; null otherwise, and the page shows the trip's public sections (issue #85).
   */
  sections: TripSection[] | null
  /** The floor plan the organizer shared, when the caller (or a traveler they look after) is accepted; else null. */
  floorPlan: SharedRoomPlan | null
}

/** The organizer's changes to one guest from the Trip Control panel. */
export interface GuestUpdate {
  /** Accept, turn down, or put back to waiting. */
  status?: GuestStatus
  /** Offer a waitlisted guest the spot that opened (on the pay-first trips; accepting does it on the others). */
  offerSpot?: boolean
  /** Take back an offer nobody has paid toward: the guest goes back on the waitlist. */
  withdrawOffer?: boolean
  /** Turning down a guest whose payment arrived needs this: the organizer says the refund went out. */
  refundSent?: boolean
  /** Move the guest to a room, or null for no room. */
  roomId?: string | null
  /** Who looks after them: another guest on the trip with an account (by guest id), or null for themselves. */
  managedBy?: string | null
  /** A corrected email address, after emails to the old one bounced. Clears the email problem. */
  email?: string
  /** The organizer saw the email problem (a spam complaint): clears it without changing the address. */
  emailProblemSeen?: boolean
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
  /**
   * The limited preview (issue #39): on, only admins and people approved for early access start trips, and people
   * who run a trip can refer others. Off, anyone signed in starts trips and referrals are hidden.
   */
  limitedPreview: boolean
  /**
   * After an email telling an organizer what needs them, the hours before the next one to the same person: what comes
   * up meanwhile waits and goes in that one email. 1 to 24.
   */
  alertWindowHours: number
}

// ── What needs the organizer ─────────────────────────────────────────────────
// The rules for Trip Control's Actions, shared so the API counts the same things the screen lists (the red count in
// the account menu and on Your trips). The screen adds the words.

/** One thing the organizer does next for a guest. */
export type GuestAction =
  // A payment the guest reported, to confirm (in one tap) or, when it is short of what was due, to review. One transfer
  // for several travelers is one action: its payments share the key (the transfer).
  | { kind: 'payment'; key: string; payment: Payment; due: number; short: boolean }
  // A guest ready to accept: signed, and on the pay-first trips some payment arrived.
  | { kind: 'accept'; key: string }
  // Their payment arrived but every spot is taken: they're owed it back.
  | { kind: 'refund'; key: string; paidCents: number }
  // Emails to them bounced (fix the address) or they marked one as spam (the organizer just needs to know).
  | { kind: 'email'; key: string; problem: 'bounced' | 'complained' }
  // Their room costs more or less than the price they signed (issue #30): charge or credit the difference, or leave it.
  | { kind: 'room_price'; key: string; diffCents: number }

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

/**
 * Guests waiting on the waitlist for a spot (not yet offered one), in the order they joined it. The order is only for
 * reading: the organizer offers a spot to anyone on it (owner's decision, 2026-10-27).
 */
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

/** What the organizer does next for one guest, if anything: the trip's own steps, then an email problem. */
export function guestActions(g: Guest, trip: OrganizerTrip): GuestAction[] {
  const steps = tripSteps(g, trip)
  if (g.status === 'declined') return steps
  if (g.terms && g.roomPriceDiffCents !== 0)
    steps.push({ kind: 'room_price', key: `${g.id}-room-price`, diffCents: g.roomPriceDiffCents })
  return g.emailProblem
    ? [...steps, { kind: 'email', key: `${g.id}-email`, problem: g.emailProblem }]
    : steps
}

function tripSteps(g: Guest, trip: OrganizerTrip): GuestAction[] {
  if (g.status === 'declined' || !g.signedAt) return []
  const full = tripFull(trip)
  // Someone on the waitlist waits for the organizer to pick them (waitlistSpotOpen), not for an action of their own.
  if (g.status === 'interested' && g.waitlistedAt && !g.offeredAt) return []
  const payFirst = trip.joinMode !== 'accept_first'
  const paid = confirmedCents(g)
  const out: GuestAction[] = g.payments
    .filter((p) => p.status === 'reported')
    .map((p) => {
      const due = g.terms ? dueWhenSent(p, g.payments, g.terms) : 0
      return {
        kind: 'payment',
        key: p.transferId ?? p.id,
        payment: p,
        due,
        short: p.guestPaymentAmount < due,
      }
    })
  if (g.status !== 'interested') return out
  if (full) {
    if (paid && !g.refundSentAt)
      out.push({ kind: 'refund', key: `${g.id}-refund`, paidCents: paid })
    return out
  }
  if (payFirst && !paid) return out
  out.push({ kind: 'accept', key: `${g.id}-accept` })
  return out
}

/**
 * A spot opened while people wait on the waitlist: one action for the trip, to open the waitlist and offer it to
 * whoever the organizer picks. On an accept-first trip, a spot not taken. On the others, more spots left than guests
 * already able to pay for one (waiting, not refunded, not on the waitlist unless offered a spot): the buffer that lets
 * newcomers join (waitlisting) doesn't count here, so one spot asks for one offer.
 */
export function waitlistSpotOpen(trip: OrganizerTrip): boolean {
  if (waitlist(trip.guests).length === 0 || tripFull(trip)) return false
  if (trip.joinMode === 'accept_first' || trip.maxGuests === null) return true
  const spotsLeft = trip.maxGuests - trip.guests.filter((g) => g.status === 'approved').length
  const inLine = trip.guests.filter(
    (g) => g.status === 'interested' && !g.refundSentAt && (!g.waitlistedAt || g.offeredAt)
  ).length
  return spotsLeft > inLine
}

/** Everything that needs the organizer on a trip: the red count beside Actions. */
export const tripActionCount = (trip: OrganizerTrip): number =>
  new Set(trip.guests.flatMap((g) => guestActions(g, trip).map((a) => a.key))).size +
  (waitlistSpotOpen(trip) ? 1 : 0) +
  trip.receipts.unmatched.length +
  trip.questionsWaiting +
  trip.changeRequestsOpen.length

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
  kind: 'refund_terms' | 'feature_access'
  /** feature_access only: the paid feature they asked to try. */
  feature?: PaidFeature
  /** The trip they were setting up, if it's saved. */
  tripId?: string
  text: string
}

/**
 * A request as the Admin toolbox lists it: an organizer's other refund terms, or someone asking for early access to
 * start trips while Travel HQ is a limited preview (from the public early access form, so name and email as typed).
 */
export interface OrganizerRequest {
  id: string
  kind: 'refund_terms' | 'early_access' | 'feature_access'
  /** feature_access only: the paid feature they asked to try ('' otherwise). */
  feature: PaidFeature | ''
  /** Who asked, by name and email, and the trip they were setting up. */
  userName: string
  userEmail: string
  tripName: string
  text: string
  createdAt: string
  /** Early access only: who referred them (by name, '' when they asked themselves), and whether the admin approved. */
  referredBy: string
  approved: boolean
}

/**
 * Organizer help (issue #66): Travel HQ's own answers to organizers' questions, behind the Help button on every
 * organizer page. Not the trip page's Questions, which organizers write for their guests (issue #13).
 *
 * Where an answer shows first: one of the trip editor's steps, or Trip Control.
 */
export type HelpPage =
  | 'editor:basics'
  | 'editor:signups'
  | 'editor:rooms'
  | 'editor:pricing'
  | 'editor:payments'
  | 'editor:customization'
  | 'control'
  | 'features'
  | 'planner'

export const HELP_PAGES: { value: HelpPage; label: string }[] = [
  { value: 'editor:basics', label: 'Editor: Trip basics' },
  { value: 'editor:signups', label: 'Editor: Sign-ups and the trip page' },
  { value: 'editor:rooms', label: 'Editor: Rooms' },
  { value: 'editor:pricing', label: 'Editor: Pricing' },
  { value: 'editor:payments', label: 'Editor: Payments' },
  { value: 'editor:customization', label: 'Editor: Customization' },
  { value: 'control', label: 'Trip Control' },
  { value: 'features', label: 'Your Membership' },
  { value: 'planner', label: 'Room planner' },
]

/** The sections of "All topics", in order. */
export type HelpTopic = 'start' | 'rooms' | 'signups' | 'payments' | 'tripPage' | 'questions'

export const HELP_TOPICS: { value: HelpTopic; label: string }[] = [
  { value: 'start', label: 'Getting started' },
  { value: 'rooms', label: 'Room planner' },
  { value: 'payments', label: 'Payments' },
  { value: 'tripPage', label: 'The trip page' },
  { value: 'questions', label: 'Guests’ questions' },
  // Last on purpose (owner's ask, 2026-11-02): the Yahoo and "If I'm going" questions come after the rest.
  { value: 'signups', label: 'Sign-ups' },
]

export const HELP_QUESTION_MAX = 300
export const HELP_ANSWER_MAX = 4000
/** What an organizer types into "Ask us a question". */
export const HELP_ASK_MAX = 2000

/** One answer as organizers see it. The answer is plain text; a blank line starts a new paragraph. */
export interface HelpEntry {
  key: string
  topic: HelpTopic
  question: string
  answer: string
  pages: HelpPage[]
}

/** An answer as the admin's Help page shows it: where it comes from, and whether its default moved on since. */
export interface AdminHelpEntry extends HelpEntry {
  /** Travel HQ's default as is, the admin's version of a default, or one the admin added. */
  source: 'default' | 'edited' | 'added'
  hidden: boolean
  /** Edited only: the default in code changed after the admin's edit, so the admin should look again. */
  defaultChanged: boolean
  /** Edited only: the default it replaces. */
  original: { question: string; answer: string } | null
}

/** The admin adding or changing an answer. */
export interface HelpEntryInput {
  topic: HelpTopic
  question: string
  answer: string
  pages: HelpPage[]
  hidden: boolean
}

/** An organizer asking us: the question, the page they were on, and the trip when there is one. */
export interface HelpAskInput {
  question: string
  page: HelpPage
  tripId?: string
}

/** A question an organizer asked, as the admin's Help page lists it. */
export interface AdminHelpQuestion {
  id: string
  question: string
  page: HelpPage
  tripName: string
  userName: string
  userEmail: string
  createdAt: string
  /** null until the admin answers. */
  answer: string | null
  answeredAt: string | null
}

/** The admin's answer, emailed to the organizer, and optionally added to the help for everyone. */
export interface HelpAnswerInput {
  answer: string
  addToHelp: { question: string; topic: HelpTopic; pages: HelpPage[] } | null
}

/** What answering a question did: the email to the organizer went, and the help got the answer (when asked to). */
export interface HelpAnswerResult {
  emailed: boolean
  added: boolean
}

/** A variable an email template can use, as the Emails page lists it; a list has fields for inside {{#each}}. */
export interface EmailVariable {
  path: string
  label: string
  fields?: { name: string; label: string }[]
}

/** One email Travel HQ sends, as the Admin toolbox's Emails page edits it. */
export interface EmailTemplateView {
  kind: string
  name: string
  /** When it goes out, in one line. */
  when: string
  subject: string
  /** HTML with {{variables}}, inside Travel HQ's frame when sent. */
  body: string
  /** The variables this email may use, in groups ("Trip", "Guest", "Payment details"). */
  variables: { group: string; items: EmailVariable[] }[]
  /** Still the wording Travel HQ started with (no admin version saved). */
  isDefault: boolean
  updatedAt: string | null
}

export interface EmailTemplateInput {
  subject: string
  body: string
}

/** Who a preview is written to: a guest who can pay now, one who can't yet, or one on the waitlist. */
export type EmailPreviewGuest = 'can_pay' | 'not_yet' | 'waitlisted'

/** A template filled in for a sample guest, or what's wrong with its subject and its body, each shown beside it. */
export interface EmailPreview {
  subjectProblems: string[]
  bodyProblems: string[]
  subject: string
  html: string
  text: string
}

/** A bounce, a send blocked because the address bounced before, or a spam complaint, as Resend reported it. */
export interface EmailProblemNotice {
  id: string
  address: string
  kind: 'bounced' | 'blocked' | 'complained'
  /** The email's subject, and Resend's reason (the receiving server's words). */
  subject: string
  detail: string
  at: string
  /** The guests on that address now, and whether each one's problem is still waiting for their organizer. */
  guests: { tripId: string; tripName: string; name: string; open: boolean }[]
}

/** What became of an email: what sending said, then what Resend reported. */
export type EmailSendStatus =
  | 'sent'
  | 'mocked'
  | 'not_deliverable'
  | 'failed'
  | 'delivered'
  | 'delayed'
  | 'bounced'
  | 'blocked'
  | 'complained'

/** One email Travel HQ sent, for the Admin toolbox's Sent Emails: the envelope, never what it said. */
export interface AdminSentEmail {
  id: string
  /** Which email (EmailTemplate kind), and its name on the Emails page. */
  kind: string
  kindName: string
  to: string
  subject: string
  tripId: string | null
  tripName: string | null
  status: EmailSendStatus
  /** Resend's reason, for a bounce or a failure. */
  detail: string
  sentAt: string
  statusAt: string
  /** Resend's id for it, to look it up in Resend; null when it never reached Resend (not sent, or failed). */
  resendId: string | null
}

/** The last 30 days of sent emails, newest first, and every kind of email (for the filter). */
export interface AdminSentEmails {
  emails: AdminSentEmail[]
  kinds: { kind: string; name: string }[]
}

/** One number on the Admin toolbox's Metrics page: all time, and the last 30 days. */
export interface AdminMetric {
  total: number
  recent: number
}

/** The Admin toolbox's Metrics: sample trips left out. Money in cents. */
export interface AdminMetrics {
  /** People who accepted the Terms of Use. */
  users: AdminMetric
  /** Trips created (a deleted trip counts until it is erased). */
  trips: AdminMetric
  /** Trips published, not deleted, with at least one accepted guest: real trips, not drafts. */
  liveTrips: number
  /** Payments an organizer confirmed, and the money they recorded. */
  payments: AdminMetric
  paymentCents: AdminMetric
  /** Payments a guest reported that wait for the organizer. */
  paymentsWaiting: number
  /** Every payment by who put it in: the guest, the organizer, or a forwarded receipt. */
  loggedBy: { guest: number; organizer: number; email: number }
  /** Requests turned away before any route (scanners): the last 24 hours, 7 days, and the 7 days' top 5 paths. */
  botRequests: { day: number; week: number; topPaths: { path: string; count: number }[] }
}

/** A reminder still to go out, for Trip Control's Reminders section. */
export interface UpcomingReminder {
  date: string
  label: string
  paymentDue: boolean
  /** The day it goes out ('YYYY-MM-DD'), in the morning (US time). */
  sendOn: string
  /** Who it would go to if it went out now, by name: accepted guests, or for a payment those who owe by then. */
  to: string[]
}

/** A reminder that went out: to whom, and when it started. */
export interface SentReminder {
  date: string
  label: string
  paymentDue: boolean
  sentAt: string
  to: string[]
}

export interface TripReminders {
  upcoming: UpcomingReminder[]
  sent: SentReminder[]
  /** Guests who stopped updates for this trip, by name: reminders skip them. */
  stopped: string[]
}

/** The "Stop updates for this trip" page, reached from the link in a reminder. */
export interface StopUpdatesView {
  tripName: string
  firstName: string
  stopped: boolean
  /** The link is from the trip's Interested list (issue #77), not a guest's: they only get announcement emails. */
  interested: boolean
}

// ── Announcements (issue #12) ──────────────────────────────────────────────────

/**
 * Who a post is for: everyone accepted onto the trip, or the accepted guests who still owe when it goes. Guests who
 * haven't been accepted yet see no announcements (owner's decision, 2026-10-29).
 */
export type AnnouncementAudience = 'accepted' | 'owing'

export const ANNOUNCEMENT_MAX = 4000
export const REPLY_MAX = 2000

/** What an organizer writes in "Post an announcement". */
export interface AnnouncementInput {
  body: string
  audience: AnnouncementAudience
  /** Email it as well; guests who stopped updates still see it on their join page. */
  email: boolean
  pinned: boolean
  /**
   * Email it to the trip's Interested list too (issue #77; owner's decisions, 2026-11-14): optional per post, for a
   * post to everyone on the trip. Email only: they don't see it on the trip page and can't reply.
   */
  emailInterested: boolean
}

export interface AnnouncementReplyView {
  id: string
  /** "Monique H." for a guest; the organizer's first name. */
  authorName: string
  fromOrganizer: boolean
  body: string
  createdAt: string
  /** The caller wrote it, so they may remove it (organizers may remove any). */
  mine: boolean
}

export interface AnnouncementView {
  id: string
  authorName: string
  body: string
  audience: AnnouncementAudience
  pinned: boolean
  createdAt: string
  replies: AnnouncementReplyView[]
  /** Trip Control only: how many guests it was for when it went, and how many it was emailed to. */
  sentTo?: number
  emailedTo?: number
  /** Trip Control only: how many on the Interested list it was emailed to. */
  interestedEmailedTo?: number
}

/** Trip Control's Announcements: the posts, pinned first, and who each audience reaches now (for the dialog). */
export interface TripAnnouncements {
  announcements: AnnouncementView[]
  audiences: Record<AnnouncementAudience, { guests: number; stopped: number }>
  /** The Interested list an announcement can also be emailed to: people not accepted onto the trip, and how many of them stopped updates. */
  interested: { people: number; stopped: number }
}

/** The join page's Announcements: the posts for the caller (none until they're accepted), and whether they may reply. */
export interface GuestAnnouncements {
  announcements: AnnouncementView[]
  canReply: boolean
}

// ── Questions, the trip page's FAQ (issue #13) ─────────────────────────────────

export const QUESTION_MAX = 500
export const ANSWER_MAX = 4000

/**
 * Where a question stands: waiting for the organizers, answered for everyone (on the trip page), or answered for the
 * person who asked only (owner's decisions, 2026-10-28 and 2026-10-30).
 */
export type QuestionStatus = 'waiting' | 'public' | 'private'

/** A question and its answer as the trip page shows it to everyone. */
export interface FaqEntry {
  id: string
  question: string
  answer: string
}

/** One of the signed-in caller's own questions on a trip: their private answers and the ones still waiting. */
export interface MyQuestion {
  id: string
  question: string
  answer: string | null
  status: QuestionStatus
  createdAt: string
}

/** Trip Control's view of a question: who asked (null for one an organizer added), and its answer. */
export interface TripQuestion {
  id: string
  question: string
  answer: string | null
  status: QuestionStatus
  /** "Kendra M.", and whether they're a guest on the trip; null when an organizer added it. */
  askerName: string | null
  askerOnTrip: boolean
  createdAt: string
  answeredAt: string | null
}

/** Trip Control's Questions: waiting ones first (oldest first), then the trip page's in order, then private answers. */
export interface TripQuestions {
  waiting: TripQuestion[]
  published: TripQuestion[]
  private: TripQuestion[]
}

/** Answering a question, or adding or editing an entry: who sees the answer is 'public' or 'private'. */
export interface QuestionAnswerInput {
  question: string
  answer: string
  status: 'public' | 'private'
}

// ── Trip change requests (issue #82) ───────────────────────────────────────────

export const CHANGE_REQUEST_MAX = 1000
export const CHANGE_NOTE_MAX = 2000
export const CHANGE_REPLY_MAX = 2000

/**
 * Where an accepted guest's request for a change to their trip stands: open, done, or not possible (owner's decisions,
 * 2026-11-15). Always private: never on the trip page.
 */
export type ChangeRequestStatus = 'open' | 'done' | 'declined'

/** One of the signed-in guest's own requests, with the organizer's message once it's closed. Never the notes. */
export interface MyChangeRequest {
  id: string
  request: string
  status: ChangeRequestStatus
  reply: string | null
  createdAt: string
  closedAt: string | null
}

/** What the trip page needs for a guest's requests: whether they can ask (accepted), and theirs, newest first. */
export interface MyChangeRequests {
  canAsk: boolean
  requests: MyChangeRequest[]
}

/** An organizer's note on a request, to track it happening. Only the trip's organizers see notes. */
export interface ChangeNote {
  id: string
  text: string
  authorName: string
  createdAt: string
}

/** Trip Control's view of a request: who asked, about which guest, its notes oldest first, and how it was closed. */
export interface TripChangeRequest {
  id: string
  guestId: string
  /** The guest it's about, "Kendra Mills", and who asked when that's someone else (who signed them up). */
  guestName: string
  requesterName: string
  request: string
  status: ChangeRequestStatus
  reply: string | null
  closedByName: string | null
  createdAt: string
  closedAt: string | null
  notes: ChangeNote[]
}

/** Closing a request: done, or not possible ('declined'), with a message to the guest (required when not possible). */
export interface ChangeCloseInput {
  status: 'done' | 'declined'
  reply: string
}

// ── Forwarded receipts (issue #12, receipts@) ──────────────────────────────────

/** The part before the @ of a trip's receipts address: 3 to 40 lowercase letters, digits and hyphens. */
export const RECEIPTS_ADDRESS_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/

/** A trip's receipts address, as Trip Control and the trip editor show it. */
export interface TripReceipts {
  /** The part before the @, or null until set. */
  address: string | null
  /** The whole address, when both it and this environment's receipts domain are set. */
  email: string | null
  /** This environment's receipts domain, so the editor can show "@receipts.travel-hq.app" beside the field. */
  domain: string | null
  /** Receiving email is set up here (Resend's receiving key, webhook and domain). */
  on: boolean
  /** Forwarded receipts it couldn't place, oldest first, for the organizer to match to a guest or dismiss. */
  unmatched: ForwardedReceiptItem[]
  /** Other addresses an organizer said belong to a guest, so receipts from them are filed on that guest. */
  senders: RememberedSender[]
}

/** An address an organizer tied to a guest when matching a receipt from it. */
export interface RememberedSender {
  id: string
  guestId: string
  address: string
}

/** A forwarded receipt waiting for an organizer: what was read from it and why it wasn't placed. */
export interface ForwardedReceiptItem {
  id: string
  receivedAt: string
  fromAddress: string | null
  subject: string | null
  /** Why it needs the organizer, in a sentence. */
  reason: string
  amountCents: number | null
  payerName: string
  methodKind: PaymentMethodKind | 'other' | null
  sentOn: string | null
  /** The start of the email's text, to read before matching it. */
  excerpt: string
  /** The guest it most likely is, when there's a good guess (the organizer still picks). */
  suggestedGuestId: string | null
  /** It came from an address nobody on the trip uses, so the organizer can tie that address to the guest. */
  fromStranger: boolean
}

/** Matching a forwarded receipt to a guest: it becomes their reported payment, for the organizer to confirm. */
export interface MatchReceiptInput {
  guestId: string
  /** Whole cents; what the receipt says unless the organizer corrects it. */
  amountCents: number
  /** 'YYYY-MM-DD' */
  sentOn: string
  /** The organizer says the money arrived: confirmed in the same step instead of waiting as reported. */
  confirm: boolean
  /** File later receipts from this receipt's sender on the same guest. */
  remember: boolean
}

/** The forwarded email a payment was read from, as its proof. */
export interface ReceiptProof {
  receivedAt: string
  fromAddress: string | null
  subject: string | null
  /** Resend found the sender's domain vouched for the From address. */
  senderVerified: boolean
  /** The start of the email's text. */
  excerpt: string
}

export const DISMISS_RECEIPT_REASONS = [
  'not_a_payment',
  'already_recorded',
  'not_this_trip',
] as const
export type DismissReceiptReason = (typeof DISMISS_RECEIPT_REASONS)[number]
export const DISMISS_RECEIPT_LABELS: Record<DismissReceiptReason, string> = {
  not_a_payment: 'Not a payment',
  already_recorded: 'Already recorded',
  not_this_trip: 'Not for this trip',
}

export type ForwardedReceiptStatus =
  'received' | 'processing' | 'recorded' | 'unmatched' | 'dismissed' | 'rejected' | 'failed'

/** One email received, as the Admin toolbox lists it: the envelope and what became of it, never its text. */
export interface AdminForwardedReceipt {
  id: string
  receivedAt: string
  toAddress: string | null
  fromAddress: string | null
  subject: string | null
  status: ForwardedReceiptStatus
  tripId: string | null
  tripName: string | null
  senderVerified: boolean
  amountCents: number | null
  reason: string | null
  error: string | null
  attempts: number
  canRunAgain: boolean
}

/** One receipts address a trip has used, for the Admin toolbox: in use, retired (held) or released. */
export interface AdminReceiptsAddress {
  id: string
  address: string
  email: string | null
  tripId: string
  /** The trip's name today; null when the trip was deleted. */
  tripName: string | null
  firstUsedAt: string
  removedAt: string | null
  /** Emails that still arrived at a retired address since it was retired (all refused), and when the last came. */
  receivedSinceRemoval: number
  lastReceivedAt: string | null
  releasedAt: string | null
  releasedBy: string | null
  canRelease: boolean
}

export interface AdminForwardedReceipts {
  on: boolean
  domain: string | null
  emails: AdminForwardedReceipt[]
  addresses: AdminReceiptsAddress[]
}

/**
 * Someone who said "I'm interested" on a trip's save the date (issue #47), as Trip Control lists them. Name, email
 * and phone are the trip's organizers' only: never on the trip page.
 */
export interface InterestedPerson {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  /** ISO time they said they're interested. */
  createdAt: string
  /** They've since signed up for the trip themselves, with the same sign-in. */
  signed: boolean
  /** ISO time they were emailed that sign-ups are open, or null. */
  toldAt: string | null
  /** They used the stop link in an email from this trip, so they get no more emails about it. */
  stopped: boolean
}

/** "I'm interested": the name and phone (the email is their sign-in's). */
export interface InterestInput {
  name: string
  phone: string
}

/** Whether the signed-in person is on a trip's interest list, and since when (ISO time, null when not on it). */
export interface MyInterest {
  onList: boolean
  createdAt: string | null
  /** The name and phone they gave, so signing up later starts with them; empty when not on the list. */
  name: string
  phone: string
}

/** What Trip Control's "Email them" sent: how many people it emailed. */
export interface InterestTold {
  told: number
}

/** "Open sign-ups" on a save the date: the trip as it is now, and how many interested people were emailed. */
export interface OpenSignupsResult {
  trip: OrganizerTrip
  told: number
}

/**
 * Paid features (issue #90). Travel HQ takes no payment for them: the admin gives a person features by email in the
 * Admin toolbox (Manage Memberships), with an optional end date and a note. The app asks one question wherever a
 * feature is used: does this person have it? A new feature adds an entry here and its key to the
 * Membership_features_check constraint (a migration). `built` is false until the feature itself exists, and the
 * screens call it "Coming soon".
 */
export type PaidFeature = 'organizer_link' | 'custom_domain' | 'room_planner'

/**
 * Paid features, in the order the admin sees them. `bucket` groups them in Manage Memberships; it is only a
 * shortcut for ticking several at once, never stored on a membership.
 */
export const PAID_FEATURES: {
  key: PaidFeature
  title: string
  text: string
  bucket: string
  built: boolean
}[] = [
  {
    key: 'organizer_link',
    title: 'Your own organizer link',
    text: 'Your trips live at your own link, like travel-hq.app/yourname, easy to say in the group chat.',
    bucket: 'Branding',
    built: false,
  },
  {
    key: 'custom_domain',
    title: 'Custom domains',
    text: 'Put a trip on its own web address, like staycation.travel-hq.app or a domain you own.',
    bucket: 'Branding',
    built: false,
  },
  {
    key: 'room_planner',
    title: 'Room planner',
    text: 'Lay out the house and drag people onto beds to work out who sleeps where, then apply it to the trip.',
    bucket: 'Planning',
    built: true,
  },
]

/** One person's paid features as the admin sets them, found by the email they sign in with. */
export interface Membership {
  email: string
  features: PaidFeature[]
  /** The last day the features are on (YYYY-MM-DD), or null for no end. */
  endsOn: string | null
  note: string
  /** Whether the end date has passed, so the features are off. */
  ended: boolean
  updatedAt: string
  /** Who last changed it, by name. */
  updatedBy: string
}

export interface MembershipInput {
  features: PaidFeature[]
  endsOn: string | null
  note: string
}

export const MEMBERSHIP_NOTE_MAX = 2000

/** The signed-in person's paid features: which they have, and those to introduce in a popup once. */
export interface MyFeatures {
  features: { key: PaidFeature; has: boolean; endsOn: string | null }[]
  /** Features they have and haven't been shown yet. */
  intros: PaidFeature[]
}

/**
 * The room planner (issue #93, a paid feature): a draft of who sleeps where, organizers only. The house is laid out as
 * named parts ("Main floor", "Upstairs, east side"), each a dotted grid holding room tiles (the trip's real rooms) and
 * landmark tiles (a bath, the kitchen). People go on bed spots; a spot holds a name, typed or picked from the trip's
 * people. Nothing reaches a guest until the organizer applies the plan, which moves guests into the rooms they're on.
 */
export const PLAN_CELL_PX = 20
/** A part of the house is at most this many dots wide (about three laptop screens) and this many tall. */
export const PLAN_MAX_COLS = 130
export const PLAN_MAX_ROWS = 80
export const PLAN_MAX_SECTIONS = 12
export const PLAN_MAX_TILES = 150
export const PLAN_NAME_MAX = 60

export const LANDMARK_KINDS = [
  'entry',
  'bath',
  'halfbath',
  'kitchen',
  'dining',
  'living',
  'stairs',
  'hall',
  'outdoor',
  'pool',
  'other',
] as const
export type LandmarkKind = (typeof LANDMARK_KINDS)[number]
export const LANDMARK_LABELS: Record<LandmarkKind, string> = {
  entry: 'Front door',
  bath: 'Full bath',
  halfbath: 'Half bath',
  kitchen: 'Kitchen',
  dining: 'Dining room',
  living: 'Living room',
  stairs: 'Stairs',
  hall: 'Hallway',
  outdoor: 'Deck, porch or balcony',
  pool: 'Pool or hot tub',
  other: 'Something else',
}

/** A floor or part of the house. `beside` starts a new column to the right; otherwise it sits under the part before it. */
export interface PlanSection {
  id: string
  name: string
  beside: boolean
  /** Its size in dots. */
  cols: number
  rows: number
  /** Space above it in dots, so a wing can sit level with the middle of the part beside it (absent: none). */
  down?: number
  /** Stretched across the whole plan below the parts before it, like an outside area (absent: in a column). */
  across?: boolean
}

/** A room (one of the trip's rooms) or a landmark on a part of the house, in dots from its top left. */
export interface PlanTile {
  id: string
  sectionId: string
  roomId: string | null
  /** `turn` is how many quarter turns clockwise its picture has (1–3; absent: none). */
  landmark: { kind: LandmarkKind; label: string; turn?: number } | null
  x: number
  y: number
  w: number
  h: number
  /**
   * A room's places on the plan when the organizer added some past what the room sleeps (owner's decision, 2026-11-21):
   * applying the plan makes the room sleep this many. Absent: what the room sleeps.
   */
  places?: number
}

/** Most places a room can have, on the plan as in the trip editor. */
export const ROOM_MAX_PLACES = 20

/** How many places a room has on the plan: what it sleeps, or more when the organizer added places. */
export const planPlaces = (room: { capacity: number }, tile?: { places?: number }): number =>
  Math.max(room.capacity, Math.min(tile?.places ?? 0, ROOM_MAX_PLACES))

/**
 * One person on one place in a room: `index` counts the room's places in bed order (see `roomSpots`). The name is what
 * the organizer sees; `guestId` or `interestId` says who it was picked from, so applying moves that guest. A typed
 * name has neither and stays in the planner.
 */
export interface PlanSpot {
  roomId: string
  index: number
  name: string
  guestId: string | null
  interestId: string | null
}

export interface RoomPlanLayout {
  sections: PlanSection[]
  tiles: PlanTile[]
  spots: PlanSpot[]
  /** Names typed in but not placed yet, kept so they wait in the side panel. */
  waiting: string[]
}

/** The planner's draft, and when it was last saved (null: never). */
export interface RoomPlan {
  layout: RoomPlanLayout
  updatedAt: string | null
  /** When the organizer last shared the plan with accepted guests (by applying rooms); null while it isn't shared. */
  sharedAt: string | null
}

/**
 * The floor plan an organizer shared with accepted guests, as they applied it (never the draft). Accepted guests on a
 * bed show as "First L."; anyone else on one (pending, the Interested list, a typed name) is taken, with no name. No
 * prices. Only on the join page, for an accepted guest, when the organizer shares it.
 */
export interface SharedRoomPlan {
  sharedAt: string
  sections: PlanSection[]
  tiles: SharedPlanTile[]
}

export interface SharedPlanTile {
  id: string
  sectionId: string
  x: number
  y: number
  w: number
  h: number
  landmark: PlanTile['landmark']
  /** A room's name, beds and each place on them; null for a landmark. */
  room: {
    name: string
    bedTypes: BedType[]
    places: (RoomSpot & {
      /** "First L." for an accepted guest; null for a free place or a taken one. */
      name: string | null
      taken: boolean
      /** The guest reading it, or a traveler they look after. */
      you: boolean
    })[]
  } | null
}

/** One place to sleep in a room: which bed (null: a place the beds don't cover, like a floor mattress) and where on it. */
export interface RoomSpot {
  index: number
  bed: number | null
  /** 0 for the first person on the bed, 1 for the second; on a bunk, 0 is the top. */
  slot: number
}

/**
 * The places a room has, in bed order: every place on every bed (two on a bed that sleeps two), so the organizer can
 * put someone on the bed they mean, then plain places for what the beds don't cover. A room may have more bed places
 * than it sleeps; the planner counts the people in it against what it sleeps.
 */
export function roomSpots(room: { bedTypes: BedType[]; capacity: number }): RoomSpot[] {
  const spots: RoomSpot[] = []
  room.bedTypes.forEach((b, bed) => {
    for (let slot = 0; slot < BED_LABELS[b].sleeps; slot++)
      spots.push({ index: spots.length, bed, slot })
  })
  while (spots.length < room.capacity) spots.push({ index: spots.length, bed: null, slot: 0 })
  return spots
}

/** Applying the plan: whether to email the guests who move their new room. */
export interface ApplyRoomPlanInput {
  email: boolean
  /** When the draft the organizer looked at was saved: Apply refuses if it has changed since. */
  draftAt: string
  /** Show the plan, as applied now, to accepted guests; false stops showing it. */
  share: boolean
}

/** What applying the plan would do, or did: each guest who changes room and what their room price does. */
export interface RoomPlanMove {
  guestId: string
  name: string
  fromRoom: string | null
  /** The room they move to; null when the plan has them on no bed, which takes them out of their room. */
  toRoom: string | null
  toRoomId: string | null
  /** Positive: a charge onto their balance; negative: a credit; 0: same price, or they haven't signed. */
  priceDiffCents: number
  /** The guest picked their room themselves when they joined, and this replaces it. */
  replacesOwnPick: boolean
}

export interface RoomPlanApplyResult {
  moved: number
  emailed: number
  /** Guests whose room price change couldn't go onto their balance (Trip Control asks about it). */
  needsLook: string[]
}
