import { createHash } from 'node:crypto'
import type { TermsDocument, TermsKind, TermsSection } from '../trips/trip-types'

/**
 * Travel HQ's own Terms: the Terms of Use everyone accepts, and the Organizer Terms anyone who runs a trip accepts
 * as well. They are apart from the trip agreement (join/agreement.ts), which is between a guest and the organizer.
 * This first wording is a draft and has not had a lawyer's review; it needs one before a real trip runs here.
 *
 * The version is the fingerprint of the wording (`fingerprint`), as in Audit Differently: change a word and everyone
 * is asked to accept again; nobody has to remember to bump anything. Re-wrapping a line changes nothing.
 */

const TERMS_OF_USE: { title: string; sections: TermsSection[] } = {
  title: 'Terms of Use',
  sections: [
    {
      heading: '1. What Travel HQ is',
      body:
        'Travel HQ is an app organizers use to run group trips: a trip page, sign-ups, the trip agreement and a ' +
        'record of payments. By using Travel HQ you agree to these Terms.',
    },
    {
      heading: '2. Your trip is with its organizer',
      body:
        'Each trip is run by its organizer, not by Travel HQ. The trip agreement you sign is between you and the ' +
        'organizer. Travel HQ is not a party to it, does not plan, book or sell travel, and is not responsible ' +
        'for the trip, its costs or refunds, or anything the organizer does or does not deliver.',
    },
    {
      heading: '3. Travel HQ never holds or moves money',
      body:
        'You pay the organizer directly, the way their payment instructions say. Travel HQ only records the ' +
        'payments organizers and guests tell it about. It cannot send, hold or refund money, and it does not ' +
        'guarantee that a payment was made or that a record is complete.',
    },
    {
      heading: '4. Disagreements',
      body:
        'A disagreement about a trip, a payment or a refund is between the guest and the organizer. Travel HQ is ' +
        'not a party to it and does not decide it.',
    },
    {
      heading: '5. Your account and your information',
      body:
        'Give accurate details and keep your sign-in to yourself. The organizer of a trip you join sees your name, ' +
        'phone, email, what you signed and the payments you report. We handle your information as our Privacy page ' +
        'describes.',
    },
    {
      heading: '6. Using Travel HQ fairly',
      body:
        'Do not use Travel HQ for anything unlawful, to mislead people, or to collect money for a trip that is ' +
        "not real. Do not try to reach other people's information.",
    },
    {
      heading: '7. Changes',
      body:
        'Travel HQ may change, pause or stop parts of the app. When these Terms change, we ask you to accept them ' +
        'again before you carry on.',
    },
    {
      heading: '8. Limits',
      body:
        'Travel HQ is provided as it is. As far as the law allows, Travel HQ is not liable for losses that come ' +
        'from a trip, from payments between organizers and guests, or from disagreements between them.',
    },
  ],
}

const ORGANIZER_TERMS: { title: string; sections: TermsSection[] } = {
  title: 'Organizer Terms',
  sections: [
    {
      heading: '1. You run your trip',
      body:
        'You are responsible for the trip you organize: its plans, bookings and costs, what you promise your ' +
        'guests, and delivering it. Travel HQ is not a party to your trip.',
    },
    {
      heading: '2. You handle the money',
      body:
        'Guests pay you directly. You are responsible for the money you collect, paying the trip’s costs, refunding ' +
        'guests as your trip agreement says, keeping your records on Travel HQ accurate, and any taxes or ' +
        'reporting that apply to you.',
    },
    {
      heading: '3. Disagreements with your guests',
      body:
        'A disagreement between you and a guest is yours to settle with them. Travel HQ does not take part, decide ' +
        'it, or pay or refund anyone.',
    },
    {
      heading: '4. Licenses and registration',
      body:
        'Some states require people who sell or arrange travel to register, hold a license or bond, keep a trust ' +
        'account or give guests certain notices (for example California, Florida, Washington and Hawaii). You are ' +
        'responsible for finding out whether any of these rules apply to you, where you are and where your guests ' +
        'are, and for following them. Travel HQ does not check this and holds no such license for you.',
    },
    {
      heading: '5. The trip agreement',
      body:
        'Your guests sign Travel HQ’s trip agreement, filled in from your trip’s details. You are responsible for ' +
        'those details being right and for keeping the promises it makes in your name.',
    },
    {
      heading: '6. Your guests’ information',
      body:
        'Use your guests’ names and contact details only to run the trip. Do not sell them or share them with ' +
        'anyone who is not helping you run it.',
    },
  ],
}

/** The wording in a normal form: title and sections, whitespace collapsed. */
export function wordingOf(doc: { title: string; sections: TermsSection[] }): string {
  return [doc.title, ...doc.sections.flatMap((s) => [s.heading, s.body])]
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .join('\n')
}

/** The version of a document: the first 16 hex characters of the SHA-256 of its wording. */
export function fingerprint(doc: { title: string; sections: TermsSection[] }): string {
  return createHash('sha256').update(wordingOf(doc), 'utf8').digest('hex').slice(0, 16)
}

function document(
  kind: TermsKind,
  doc: { title: string; sections: TermsSection[] }
): TermsDocument {
  return { kind, title: doc.title, version: fingerprint(doc), sections: doc.sections }
}

export const TERMS: Record<TermsKind, TermsDocument> = {
  use: document('use', TERMS_OF_USE),
  organizer: document('organizer', ORGANIZER_TERMS),
}
