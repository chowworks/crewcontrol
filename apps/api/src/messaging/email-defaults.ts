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
  /** A reminder: optional, so it carries "Stop updates for this trip" in its footer. */
  stopLink?: true
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
<p>If you haven't paid yet, send {{trip.organizerName}} {{#if paymentDetails.deposit}}your deposit, <strong>{{paymentDetails.dueNow}}</strong>,{{else}}<strong>{{paymentDetails.dueNow}}</strong>{{/if}} to save your spot, {{#if paymentDetails.oneMethod}}this way{{else}}one of these ways{{/if}}:</p>
{{#if paymentDetails.depositKept}}<p>The deposit isn't refundable if you drop out later.</p>{{/if}}
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
    kind: 'accepted',
    name: 'Accepted onto the trip',
    when: 'To a guest when the organizer accepts them on a trip where the organizer accepts each guest first, with how to pay.',
    groups: ['trip', 'guest', 'paymentDetails'],
    subject: 'You’re in: {{trip.name}}',
    body: `<p>Hi {{guest.firstName}},</p>
<p>{{trip.organizerName}} accepted you for <strong>{{trip.name}}</strong>, {{trip.dates}}. You’re going!</p>
{{#if guest.canPay}}
<p>{{#if paymentDetails.deposit}}Your deposit{{else}}Your first payment{{/if}}, <strong>{{paymentDetails.firstPayment}}</strong>, saves your spot{{#if paymentDetails.depositKept}} and isn't refundable if you drop out later{{/if}}. Send it to {{trip.organizerName}} {{#if paymentDetails.oneMethod}}this way{{else}}one of these ways{{/if}}:</p>
<ul>
{{#each paymentDetails.methods}}<li>{{name}}: {{handle}}</li>
{{/each}}</ul>
{{#if paymentDetails.instructions}}<p>{{paymentDetails.instructions}}</p>{{/if}}
<p>Then press "I've paid" on your trip page so {{trip.organizerName}} knows to look for it.</p>
{{/if}}
<p><a href="{{trip.joinLink}}" style="display:inline-block;background:#5A2D91;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">Open your trip page</a></p>
<p>Your payment plan, your payments and your copy of the agreement are there.</p>`,
  },
  {
    kind: 'invite',
    name: 'Added to help run a trip',
    when: 'To someone a trip’s owner adds on its People screen, as an organizer or an owner. Replies go to whoever added them.',
    groups: ['invite'],
    subject: '{{invite.inviterName}} added you to help run {{invite.tripName}}',
    body: `<p>Hi,</p>
<p>{{invite.inviterName}} added you as {{#if invite.isOwner}}an owner{{else}}an organizer{{/if}} of <strong>{{invite.tripName}}</strong>, {{invite.dates}}, on Travel HQ.</p>
<p>{{#if invite.isOwner}}You can run everything {{invite.inviterName}} can: the trip page, its guests and their payments, and who helps run it.{{else}}You can help with the trip page, its guests and their payments.{{/if}}</p>
{{#if invite.signedUp}}
<p><a href="{{invite.link}}" style="display:inline-block;background:#5A2D91;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">Open the trip</a></p>
{{else}}
<p>To get in, make a Travel HQ account with this email address, <strong>{{invite.email}}</strong>. The trip is there as soon as you sign in.</p>
<p><a href="{{invite.link}}" style="display:inline-block;background:#5A2D91;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">Make your account</a></p>
{{/if}}
<p>Questions? Reply to this email and it goes to {{invite.inviterName}}.</p>`,
  },
  {
    kind: 'payment_reminder',
    name: 'Payment reminder',
    when: 'To each guest who still owes something by an installment’s due date, the days before it the organizer chose.',
    groups: ['trip', 'guest', 'paymentDetails', 'reminder'],
    stopLink: true,
    subject: '{{reminder.amountDue}} due {{reminder.when}} for {{trip.name}}',
    body: `<p>Hi {{guest.firstName}},</p>
<p>A payment for <strong>{{trip.name}}</strong> is due {{reminder.when}}, on {{reminder.date}}. By then, send {{trip.organizerName}} <strong>{{reminder.amountDue}}</strong>.</p>
{{#if guest.canPay}}
<p>Send it {{#if paymentDetails.oneMethod}}this way{{else}}one of these ways{{/if}}:</p>
<ul>
{{#each paymentDetails.methods}}<li>{{name}}: {{handle}}</li>
{{/each}}</ul>
{{#if paymentDetails.instructions}}<p>{{paymentDetails.instructions}}</p>{{/if}}
<p>Then press "I've paid" on your trip page so {{trip.organizerName}} knows to look for it.</p>
{{/if}}
<p>So far you've paid {{paymentDetails.paid}} of {{paymentDetails.total}}.</p>
<p><a href="{{trip.joinLink}}" style="display:inline-block;background:#5A2D91;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">Open your trip page</a></p>`,
  },
  {
    kind: 'date_reminder',
    name: 'Key date reminder',
    when: 'To each accepted guest, the days before a key date the organizer chose (book flights, ferry, rental car).',
    groups: ['trip', 'guest', 'reminder'],
    stopLink: true,
    subject: 'Coming up {{reminder.when}}: {{reminder.label}}',
    body: `<p>Hi {{guest.firstName}},</p>
<p>A reminder for <strong>{{trip.name}}</strong>: <strong>{{reminder.label}}</strong> is {{reminder.when}}, on {{reminder.date}}.</p>
<p>Questions? Reply to this email to reach {{trip.organizerName}}.</p>
<p><a href="{{trip.joinLink}}" style="display:inline-block;background:#5A2D91;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">Open your trip page</a></p>`,
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
  const groups = Object.fromEntries(k.groups.map((g) => [g, all[g]])) as EmailContext
  // A payment reminder's sample is the second of three payments; any other reminder's, a key date.
  if (groups.reminder && k.groups.includes('paymentDetails'))
    groups.reminder = {
      ...groups.reminder,
      label: 'Payment 2 of 3',
      paymentDue: true,
      amountDue: '$800',
    }
  return k.stopLink ? { ...groups, stopLink: all.stopLink } : groups
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
    reminder: {
      label: 'Book your flight',
      date: 'Feb 1, 2028',
      when: 'in 1 week',
      paymentDue: false,
      amountDue: '',
    },
    stopLink: 'https://travel-hq.app/stop/sample',
    contact: {
      name: 'Dana Reyes',
      email: 'dana.reyes@example.com',
      topic: 'Help with a trip',
      message:
        'Hi! I joined the Aruba trip but picked the wrong room.\nCan the organizer change it, or do I?',
    },
    invite: {
      tripName: 'Aruba Crew Getaway 2028',
      destination: 'Aruba',
      dates: 'Mar 3 – 8, 2028',
      inviterName: 'Nia Brooks',
      role: 'organizer',
      isOwner: false,
      email: 'dana.reyes@example.com',
      signedUp: false,
      link: 'https://travel-hq.app/sign-up',
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
      deposit: true,
      depositKept: false,
      paid: '$0',
      pending: '$0',
      left: '$1,200',
      dueNow: '$400',
      installmentCount: 3,
    },
  }
}
