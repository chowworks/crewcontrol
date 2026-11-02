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

/**
 * The guest's payment plan: the price, each payment with its due date, and a plain line when no date is set, so a
 * guest always knows what's due when (owner's ask, 2026-11-01). `whose` is "Your" or the traveler's name.
 */
const plan = (
  whose: string
) => `<p>${whose} price is <strong>{{paymentDetails.price}}</strong>{{#if paymentDetails.onePayment}}, paid in one payment{{#if paymentDetails.firstDue}}, due by <strong>{{paymentDetails.firstDue}}</strong>{{/if}}.{{else}}, paid in {{paymentDetails.installmentCount}} payments:{{/if}}</p>
{{#unless paymentDetails.onePayment}}<ul>
{{#each paymentDetails.plan}}<li><strong>{{amount}}</strong>{{#if date}}, due by {{date}}{{/if}}</li>
{{/each}}</ul>{{/unless}}
{{#if paymentDetails.adjustments}}<p>With credits and charges ({{paymentDetails.adjustments}}), the total is {{paymentDetails.total}}.</p>{{/if}}
{{#unless paymentDetails.datesSet}}<p>{{trip.organizerName}} hasn’t set {{#if paymentDetails.onePayment}}a due date{{else}}due dates{{/if}} yet.</p>{{/unless}}`

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
${plan('Your')}
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
<p><a href="{{trip.pageLink}}" style="display:inline-block;background:#5A2D91;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">Open your trip page</a></p>
<p>Your copy of the agreement is there too.</p>`,
  },
  {
    kind: 'accepted',
    name: 'Accepted onto the trip',
    when: 'To a guest when they’re accepted: on a trip where the organizer accepts each guest first, with how to pay; on a trip where guests pay first, once their payment is in.',
    groups: ['trip', 'guest', 'paymentDetails'],
    subject: 'You’re in: {{trip.name}}',
    body: `<p>Hi {{guest.firstName}},</p>
<p>{{trip.organizerName}} accepted you for <strong>{{trip.name}}</strong>, {{trip.dates}}. You’re going!</p>
{{#if trip.paysFirst}}
<p>Your payment arrived, so the spot is yours. So far you’ve paid {{paymentDetails.paid}} of {{paymentDetails.total}}.</p>
${plan('Your')}
{{else}}{{#if guest.canPay}}
${plan('Your')}
<p>{{#if paymentDetails.onePayment}}Your payment{{else}}{{#if paymentDetails.deposit}}Your deposit{{else}}Your first payment{{/if}}{{/if}}, <strong>{{paymentDetails.firstPayment}}</strong>, saves your spot{{#if paymentDetails.depositKept}} and isn't refundable if you drop out later{{/if}}. Send it to {{trip.organizerName}} {{#if paymentDetails.oneMethod}}this way{{else}}one of these ways{{/if}}:</p>
<ul>
{{#each paymentDetails.methods}}<li>{{name}}: {{handle}}</li>
{{/each}}</ul>
{{#if paymentDetails.instructions}}<p>{{paymentDetails.instructions}}</p>{{/if}}
<p>Then press "I've paid" on your trip page so {{trip.organizerName}} knows to look for it.</p>
{{/if}}{{/if}}
<p><a href="{{trip.pageLink}}" style="display:inline-block;background:#5A2D91;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">Open your trip page</a></p>
<p>Your payment plan, your payments and your copy of the agreement are there.</p>`,
  },
  {
    kind: 'spot_offered',
    name: 'A spot opened',
    when: 'To a guest on the waitlist when the organizer offers them a spot that opened, with how to pay for it.',
    groups: ['trip', 'guest', 'paymentDetails'],
    subject: 'A spot opened on {{trip.name}}',
    body: `<p>Hi {{guest.firstName}},</p>
<p>Good news: a spot opened on <strong>{{trip.name}}</strong>, {{trip.dates}}, and {{trip.organizerName}} offered it to you.</p>
<p>Spots go first come, first served: the first payment {{trip.organizerName}} confirms takes it. If you want it, pay soon.</p>
{{#if guest.canPay}}
${plan('Your')}
<p>Send {{trip.organizerName}} <strong>{{paymentDetails.dueNow}}</strong> {{#if paymentDetails.oneMethod}}this way{{else}}one of these ways{{/if}}:</p>
{{#if paymentDetails.depositKept}}<p>The deposit isn't refundable if you drop out later.</p>{{/if}}
<ul>
{{#each paymentDetails.methods}}<li>{{name}}: {{handle}}</li>
{{/each}}</ul>
{{#if paymentDetails.instructions}}<p>{{paymentDetails.instructions}}</p>{{/if}}
<p>Then press "I've paid" on your trip page so {{trip.organizerName}} knows to look for it.</p>
{{/if}}
<p><a href="{{trip.pageLink}}" style="display:inline-block;background:#5A2D91;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">Open your trip page</a></p>`,
  },
  {
    kind: 'offer_withdrawn',
    name: 'Offered spot no longer available',
    when: 'To a guest on the waitlist when a spot the organizer offered them is no longer available.',
    groups: ['trip', 'guest'],
    subject: 'Sorry, the spot on {{trip.name}} is no longer available',
    body: `<p>Hi {{guest.firstName}},</p>
<p>We’re really sorry. The spot {{trip.organizerName}} offered you on <strong>{{trip.name}}</strong> is no longer available.</p>
<p>Spots go first come, first served, and this one was filled before your payment came in. We know that’s disappointing.</p>
<p>You’re still on the waitlist, so if another spot opens, {{trip.organizerName}} can offer it to you and we’ll email you right away. If you already sent money, reply to this email to sort it out with {{trip.organizerName}}.</p>
<p><a href="{{trip.pageLink}}" style="display:inline-block;background:#5A2D91;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">Open your trip page</a></p>`,
  },
  {
    kind: 'signed_up_for',
    name: 'Signed someone else up',
    when: 'To someone who signs up a traveler they look after (a child, a friend), with their copy and, when they can pay now, how to pay.',
    groups: ['trip', 'guest', 'paymentDetails'],
    subject: 'You signed {{guest.firstName}} up for {{trip.name}}',
    body: `<p>Hi {{guest.signedByFirstName}},</p>
<p>You signed <strong>{{guest.fullName}}</strong> up for <strong>{{trip.name}}</strong>, {{trip.dates}}, and signed the trip agreement for them.</p>
{{#if guest.waitlisted}}
<p>The trip is full right now, so {{guest.firstName}} is on the waitlist. {{trip.organizerName}} will let you know if a spot opens.</p>
{{else}}{{#if guest.canPay}}
${plan('{{guest.firstName}}’s')}
<p>If you haven't paid yet, send {{trip.organizerName}} <strong>{{paymentDetails.dueNow}}</strong> to save {{guest.firstName}}’s spot, {{#if paymentDetails.oneMethod}}this way{{else}}one of these ways{{/if}}:</p>
{{#if paymentDetails.depositKept}}<p>The deposit isn't refundable if {{guest.firstName}} drops out later.</p>{{/if}}
<ul>
{{#each paymentDetails.methods}}<li>{{name}}: {{handle}}</li>
{{/each}}</ul>
{{#if paymentDetails.instructions}}<p>{{paymentDetails.instructions}}</p>{{/if}}
<p>Then press "I've paid" on the trip page so {{trip.organizerName}} knows to look for it.</p>
{{else}}
<p>{{trip.organizerName}} will look at {{guest.firstName}}’s spot next. Once they’re accepted, the trip page shows how to pay.</p>
{{/if}}{{/if}}
<p><a href="{{trip.pageLink}}" style="display:inline-block;background:#5A2D91;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">Open the trip page</a></p>
<p>Your copy of the agreement is there too.</p>`,
  },
  {
    kind: 'signed_up_by',
    name: 'Signed up by someone else',
    when: 'To a traveler someone else signed up, when the traveler’s email isn’t that person’s own.',
    groups: ['trip', 'guest'],
    subject: '{{guest.signedByFirstName}} signed you up for {{trip.name}}',
    body: `<p>Hi {{guest.firstName}},</p>
<p>{{guest.signedBy}} signed you up for <strong>{{trip.name}}</strong>, {{trip.dates}}, and signed the trip agreement for you. {{guest.signedByFirstName}} looks after your payments.</p>
{{#if guest.waitlisted}}<p>The trip is full right now, so you’re on the waitlist.</p>{{/if}}
<p>To see the trip and your place on it, sign in to Travel HQ with this email address, <strong>{{guest.email}}</strong>, and press "That’s me" on the join page.</p>
<p><a href="{{trip.joinLink}}" style="display:inline-block;background:#5A2D91;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">Open the join page</a></p>
<p>Questions? Reply to this email to reach {{trip.organizerName}}.</p>`,
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
<p><a href="{{trip.pageLink}}" style="display:inline-block;background:#5A2D91;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">Open your trip page</a></p>`,
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
<p><a href="{{trip.pageLink}}" style="display:inline-block;background:#5A2D91;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">Open your trip page</a></p>`,
  },
  {
    kind: 'announcement',
    name: 'Announcement',
    when: 'To the accepted guests an organizer posts an announcement to, when they tick “Email it to them too”.',
    groups: ['trip', 'guest', 'announcement'],
    stopLink: true,
    subject: '{{announcement.from}} posted an update for {{trip.name}}',
    body: `<p>Hi {{guest.firstName}},</p>
<p>{{announcement.from}} posted an update for <strong>{{trip.name}}</strong>:</p>
<div style="border-left:4px solid #5A2D91;background:#F3F6F5;border-radius:8px;padding:12px 16px;white-space:pre-wrap;">{{announcement.body}}</div>
<p>Questions? Reply under it on your trip page so everyone sees the answer, or reply to this email to reach {{trip.organizerName}}.</p>
<p><a href="{{trip.pageLink}}" style="display:inline-block;background:#5A2D91;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">Open your trip page</a></p>`,
  },
  {
    kind: 'question_asked',
    name: 'Question asked',
    when: 'To each owner and organizer of a trip when someone asks a question on its trip page. Replying answers the person who asked.',
    groups: ['question'],
    subject: 'New question about {{question.tripName}}, from {{question.askerName}}',
    body: `<p>{{question.askerName}} asked a question about <strong>{{question.tripName}}</strong>:</p>
<div style="border-left:4px solid #5A2D91;background:#F3F6F5;border-radius:8px;padding:12px 16px;white-space:pre-wrap;">{{question.question}}</div>
<p>You or another organizer can answer it in Trip Control, for everyone on the trip page or just for {{question.askerName}}. Either way, we email them the answer.</p>
<p><a href="{{question.link}}" style="display:inline-block;background:#5A2D91;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">Answer in Trip Control</a></p>`,
  },
  {
    kind: 'organizer_actions',
    name: 'Something needs you',
    when: 'To each owner and organizer when something new needs them in a trip’s Actions (a payment to confirm, a guest to accept). One email for all their trips, then none for the hours set in System Settings; what comes up meanwhile goes in the next one. Questions have their own email.',
    groups: ['alert'],
    subject:
      '{{alert.count}} new {{#if alert.single}}thing needs{{else}}things need{{/if}} you on your trips',
    body: `<p>Hi {{alert.firstName}},</p>
<p>Here’s what’s new on your trips since we last wrote:</p>
{{#each alert.trips}}<p style="margin:0 0 12px;"><strong>{{name}}</strong><br>{{summary}}<br><a href="{{link}}" style="color:#5A2D91;font-weight:600;">Open Trip Control</a></p>
{{/each}}
<p>Guests are waiting on these, so the sooner the better.</p>
<p><a href="{{alert.link}}" style="display:inline-block;background:#5A2D91;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">See your trips</a></p>`,
  },
  {
    kind: 'question_answered',
    name: 'Question answered',
    when: 'To the person who asked a question on a trip page, when an organizer answers it.',
    groups: ['question'],
    subject: 'Your question about {{question.tripName}} was answered',
    body: `<p>Hi {{question.askerName}},</p>
<p>You asked about <strong>{{question.tripName}}</strong>:</p>
<p style="font-weight:600;">{{question.question}}</p>
<div style="border-left:4px solid #5A2D91;background:#F3F6F5;border-radius:8px;padding:12px 16px;white-space:pre-wrap;">{{question.answer}}</div>
<p>{{#if question.private}}Only you see this answer on the trip page.{{else}}It's on the trip page for everyone, without your name.{{/if}}</p>
<p><a href="{{question.link}}" style="display:inline-block;background:#5A2D91;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">Open the trip page</a></p>`,
  },
  {
    kind: 'signups_open',
    name: 'Sign-ups are open',
    when: 'To each person who said they’re interested in a save the date, when an organizer opens sign-ups and presses “Email them”.',
    groups: ['interest'],
    subject: 'Sign-ups are open: {{interest.tripName}}',
    body: `<p>Hi {{interest.firstName}},</p>
<p>You said you were interested in <strong>{{interest.tripName}}</strong>, {{interest.dates}}. Sign-ups are open now.</p>
<p>To save your spot, sign up on the trip page. It takes a minute: you're already signed in, so your details are filled in.</p>
<p><a href="{{interest.link}}" style="display:inline-block;background:#5A2D91;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">Sign up</a></p>
<p>Questions? Reply to this email to ask {{interest.organizerName}}.</p>`,
  },
  {
    kind: 'trip_deleted',
    name: 'Trip deleted',
    when: 'To each guest who signed, when an owner deletes their trip: their signed agreement and payments, to keep.',
    groups: ['trip', 'guest', 'paymentDetails', 'deletion'],
    subject: 'Your copy of {{trip.name}}',
    body: `<p>Hi {{guest.firstName}},</p>
<p>{{trip.organizerName}} deleted <strong>{{trip.name}}</strong> ({{trip.dates}}) from Travel HQ, so its trip page is gone. Travel HQ erases the trip on {{deletion.eraseDate}}.</p>
<p>Here is your own record of it to keep: what you paid, and the agreement you signed, attached in full. If you're not sure what this means for the trip, reply to this email to ask {{trip.organizerName}}.</p>
<h3 style="margin:24px 0 8px;font-size:17px;">Your payments</h3>
{{#if deletion.payments}}<ul>
{{#each deletion.payments}}<li>{{date}}: {{amount}} by {{how}} ({{status}})</li>
{{/each}}</ul>{{else}}<p>No payments were recorded.</p>{{/if}}
<p>Price {{paymentDetails.total}} · Paid {{paymentDetails.paid}} · Left to pay {{paymentDetails.left}}</p>
<h3 style="margin:24px 0 8px;font-size:17px;">The agreement you signed</h3>
<p>You signed it on {{deletion.signedOn}} as {{deletion.signedName}}. Your copy is attached, exactly as you signed it.</p>`,
  },
  {
    kind: 'help_answered',
    name: 'Help question answered',
    when: 'To an organizer who asked a question from the Help button, when an admin answers it in the Admin toolbox. Replying reaches support.',
    groups: ['help'],
    subject: 'Your question about Travel HQ',
    body: `<p>Hi {{help.firstName}},</p>
<p>You asked:</p>
<p style="font-weight:600;">{{help.question}}</p>
<div style="border-left:4px solid #5A2D91;background:#F3F6F5;border-radius:8px;padding:12px 16px;white-space:pre-wrap;">{{help.answer}}</div>
<p>Anything else? Reply to this email, or tap Help on any organizer page.</p>
<p><a href="{{help.link}}" style="display:inline-block;background:#5A2D91;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">Open your trips</a></p>`,
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
  // The owner's email about a question comes before any answer, and leads to Trip Control.
  if (groups.question && k.kind === 'question_asked')
    groups.question = {
      ...groups.question,
      askerName: 'Dana Reyes',
      answer: '',
      link: 'https://travel-hq.app/organize/sample/control',
    }
  // Only the emails about someone signing a traveler up name who signed.
  if (groups.guest && k.kind.startsWith('signed_up_'))
    groups.guest = { ...groups.guest, signedBy: 'Marcus Reyes', signedByFirstName: 'Marcus' }
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
      paysFirst: false,
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
      signedBy: '',
      signedByFirstName: '',
    },
    reminder: {
      label: 'Book your flight',
      date: 'Feb 1, 2028',
      when: 'in 1 week',
      paymentDue: false,
      amountDue: '',
    },
    stopLink: 'https://travel-hq.app/stop/sample',
    announcement: {
      from: 'Nia',
      body: 'The resort sent our room list. Check-in is 3 PM on Mar 3, and the airport shuttle leaves at 1 PM.\nPack something white for the beach dinner on the last night!',
    },
    question: {
      tripName: 'Aruba Crew Getaway 2028',
      askerName: 'Dana',
      question: 'Is there an airport shuttle, or should I book a taxi?',
      answer:
        'The resort shuttle meets every flight on Mar 3. Look for the sign with our group name.',
      private: false,
      link: 'https://travel-hq.app/t/aruba-2028',
    },
    interest: {
      firstName: 'Dana',
      tripName: 'Aruba Crew Getaway 2028',
      dates: 'Mar 3 – 8, 2028',
      organizerName: 'Nia',
      link: 'https://travel-hq.app/t/aruba-2028/join',
    },
    alert: {
      firstName: 'Nia',
      count: 3,
      single: false,
      trips: [
        {
          name: 'Aruba Crew Getaway 2028',
          summary: '2 payments to confirm, 1 guest to accept.',
          link: 'https://travel-hq.app/organize/sample/control',
        },
      ],
      link: 'https://travel-hq.app/organize',
      windowHours: 4,
    },
    help: {
      firstName: 'Nia',
      question: 'Can a guest pay for their roommate who signed up on their own?',
      answer:
        'Yes. Open the roommate’s Details on Trip Control, tap Change next to “Sign-up and payments handled by” and pick who pays for them.',
      link: 'https://travel-hq.app/organize',
    },
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
    deletion: {
      eraseDate: 'Nov 29, 2026',
      agreement:
        'Trip agreement: Aruba Crew Getaway 2028\n\nThis agreement is between Nia (the organizer) and Dana Reyes (the guest)…',
      signedName: 'Dana Reyes',
      signedOn: 'Oct 21, 2026',
      payments: [
        { date: 'Oct 22, 2026', amount: '$400', how: 'Zelle', status: 'confirmed' },
        { date: 'Dec 1, 2026', amount: '$400', how: 'Cash App', status: 'reported' },
      ],
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
      firstDue: 'Nov 15, 2027',
      plan: [
        { date: 'Nov 15, 2027', amount: '$400' },
        { date: 'Dec 15, 2027', amount: '$400' },
        { date: 'Jan 15, 2028', amount: '$400' },
      ],
      onePayment: false,
      datesSet: true,
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
