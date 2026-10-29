import type { EmailContext, VariableGroup } from './email-template'

/** The emails Travel HQ sends. Each starts with the wording here; the admin's version (EmailTemplate) replaces it. */
export interface EmailKind {
  kind: string
  name: string
  /** When it goes out, in one line, for the Emails page. */
  when: string
  groups: VariableGroup[]
  subject: string
  body: string
}

export const EMAIL_KINDS: EmailKind[] = [
  {
    kind: 'joined',
    name: 'Signed the trip agreement',
    when: 'To a guest right after they sign, with their copy and, when they can pay now, how to pay.',
    groups: ['trip', 'guest', 'paymentDetails'],
    subject: 'You signed up for {{trip.name}}',
    body: `<p>Hi {{guest.firstName}},</p>
<p>You signed the trip agreement for <strong>{{trip.name}}</strong>, {{trip.dates}}.</p>
{{#if guest.waitlisted}}
<p>The trip is full right now, so you're on the waitlist. {{trip.organizerName}} will let you know if a spot opens.</p>
{{else}}{{#if guest.canPay}}
<p>If you haven't paid yet, send {{trip.organizerName}} <strong>{{paymentDetails.dueNow}}</strong> to hold your spot, {{#if paymentDetails.oneMethod}}this way{{else}}one of these ways{{/if}}:</p>
<ul>
{{#each paymentDetails.methods}}<li>{{name}}: {{handle}}</li>
{{/each}}</ul>
{{#if paymentDetails.instructions}}<p>{{paymentDetails.instructions}}</p>{{/if}}
<p>Then press "I've paid" on your trip page so {{trip.organizerName}} knows to look for it.</p>
{{else}}
<p>{{trip.organizerName}} will look at your spot next. Once you're accepted, your trip page shows how to pay.</p>
{{/if}}{{/if}}
<p><a href="{{trip.joinLink}}" style="display:inline-block;background:#5A2D91;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">Open your trip page</a></p>
<p>Your copy of the agreement is there too.</p>`,
  },
  {
    kind: 'contact',
    name: 'Contact form message',
    when: 'To Travel HQ support when someone sends the contact form. Replying answers them.',
    groups: ['contact'],
    subject: 'Contact form: {{contact.topic}}, from {{contact.name}}',
    body: `<h2 style="margin:0 0 4px;font-size:20px;">New message from {{contact.name}}</h2>
<p style="margin:0 0 16px;color:#4A5568;">Topic: {{contact.topic}}</p>
<div style="border-left:4px solid #F2B33D;background:#F3F6F5;border-radius:8px;padding:12px 16px;white-space:pre-wrap;">{{contact.message}}</div>
<p style="margin-top:20px;"><a href="mailto:{{contact.email}}" style="display:inline-block;background:#5A2D91;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">Reply to {{contact.name}}</a></p>
<p style="font-size:14px;color:#4A5568;">Or just reply to this email: it goes to {{contact.email}}.</p>`,
  },
]

export const emailKind = (kind: string): EmailKind | undefined =>
  EMAIL_KINDS.find((k) => k.kind === kind)

/** Who the Emails page's preview is written to: fictional, on a fictional trip. */
export type PreviewGuest = 'can_pay' | 'not_yet' | 'waitlisted'

/** The sample for a preview, with only the groups this email has (so a contact email has no trip). */
export function sampleFor(k: EmailKind, guest: PreviewGuest): EmailContext {
  const all = sampleContext(guest)
  return Object.fromEntries(k.groups.map((g) => [g, all[g]])) as EmailContext
}

export function sampleContext(guest: PreviewGuest): Required<EmailContext> {
  return {
    trip: {
      name: 'Aruba Crew Getaway 2028',
      destination: 'Aruba',
      startDate: 'Mar 3, 2028',
      endDate: 'Mar 8, 2028',
      dates: 'Mar 3 – 8, 2028',
      organizerName: 'Nia',
      description: 'Five days at an all-inclusive resort on Eagle Beach.',
      pricePerPerson: '$1,200',
      installmentCount: 3,
      pageLink: 'https://travel-hq.app/t/aruba-2028',
      joinLink: 'https://travel-hq.app/t/aruba-2028/join',
      highlights: [
        { title: 'All-inclusive', detail: 'Food and drinks covered' },
        { title: 'Eagle Beach', detail: 'Steps from the water' },
      ],
      keyDates: [
        { date: 'Jan 5, 2028', label: 'Final payment due' },
        { date: 'Feb 1, 2028', label: 'Book your flight' },
      ],
    },
    guest: {
      firstName: 'Dana',
      lastName: 'Reyes',
      fullName: 'Dana Reyes',
      email: 'dana.reyes@example.com',
      phone: '(555) 010-0142',
      status: guest === 'can_pay' ? 'Accepted' : 'Signed',
      accepted: guest === 'can_pay',
      canPay: guest === 'can_pay',
      waitlisted: guest === 'waitlisted',
      room: '',
    },
    contact: {
      name: 'Dana Reyes',
      email: 'dana.reyes@example.com',
      topic: 'Help with a trip',
      message:
        'Hi! I joined the Aruba trip but picked the wrong room.\nCan the organizer change it, or do I?',
    },
    paymentDetails: {
      methods: [
        { name: 'Zelle', handle: '(555) 010-0199' },
        { name: 'Cash App', handle: '$NiaTrips' },
      ],
      oneMethod: false,
      instructions: 'Put "Aruba" and your name in the note.',
      price: '$1,200',
      adjustments: '',
      total: '$1,200',
      firstPayment: '$400',
      paid: '$0',
      pending: '$0',
      left: '$1,200',
      dueNow: '$400',
      installmentCount: 3,
    },
  }
}
