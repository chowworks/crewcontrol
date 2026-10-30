import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Handlebars from 'handlebars'

/**
 * Emails Travel HQ sends, written by an admin as HTML with variables ({{trip.name}}, {{#each trip.keyDates}}…) and
 * rendered here. Every variable is HTML-escaped, so a guest's name or a trip's description can never add markup to
 * an email; {{{triple braces}}} are refused for the same reason. Only the variables below exist, and a template that
 * uses any other one, or a helper other than if, unless and each, can't be saved (`checkTemplate`).
 */

/** The facts an email can use. Money is already written out ("$1,200"); dates are "Jun 12, 2027". */
export interface EmailContext {
  /** In emails to a guest: their trip, them, and how to pay. */
  trip?: {
    name: string
    destination: string
    startDate: string
    endDate: string
    /** "Jun 12 – 19, 2027" */
    dates: string
    organizerName: string
    description: string
    pricePerPerson: string
    installmentCount: number
    /** The public trip page, and the guest's join page. */
    pageLink: string
    joinLink: string
    highlights: { title: string; detail: string }[]
    keyDates: { date: string; label: string }[]
  }
  guest?: {
    firstName: string
    lastName: string
    fullName: string
    email: string
    phone: string
    /** "Signed", "Accepted" or "Turned down". */
    status: string
    accepted: boolean
    /** May pay now, as their join page decides: the default emails show payment details only then. */
    canPay: boolean
    waitlisted: boolean
    /** The room they picked, or "". */
    room: string
  }
  /** Always there for a guest who signed; an email shows them only when it means to (guest.canPay). */
  paymentDetails?: {
    methods: { name: string; handle: string }[]
    /** Just one way to pay, so the wording can say "this way" rather than "one of these ways". */
    oneMethod: boolean
    instructions: string
    price: string
    adjustments: string
    total: string
    firstPayment: string
    /** The plan starts with a deposit ("Deposit first"), and whether the trip keeps it when a guest drops out. */
    deposit: boolean
    depositKept: boolean
    paid: string
    pending: string
    /** What's left after confirmed and reported payments. */
    left: string
    /** What's still due now to hold the spot; "$0" once covered. */
    dueNow: string
    installmentCount: number
  }
  /** In a reminder: the key date it's about, and for a payment, what's owed by then. */
  reminder?: {
    label: string
    /** "Jun 12, 2027" */
    date: string
    /** "in 7 days", "tomorrow", "today" */
    when: string
    paymentDue: boolean
    /** What the guest owes by the date, after what they paid or reported ("$400"); "" unless a payment is due. */
    amountDue: string
  }
  /**
   * A reminder's "Stop updates for this trip" link. Not a variable: when it's there the footer always shows it, so no
   * template can drop it.
   */
  stopLink?: string
  /** In an announcement (issue #12): who posted it and what they wrote. */
  announcement?: {
    from: string
    body: string
  }
  /**
   * About a question on a trip (issue #13): to each of the trip's organizers when someone asks, and to the asker when it's answered
   * (`answer` is "" until then).
   */
  question?: {
    tripName: string
    askerName: string
    question: string
    answer: string
    /** Answered for the asker only, not on the trip page. */
    private: boolean
    /** Trip Control for the owner; the trip page for the asker. */
    link: string
  }
  /** In the contact form's email to Travel HQ support: who wrote, about what, and their message. */
  contact?: {
    name: string
    email: string
    topic: string
    message: string
  }
  /** In the email to someone added to help run a trip (issue #12): the trip, who added them, and how to get in. */
  invite?: {
    tripName: string
    destination: string
    /** "Jun 12 – 19, 2027" */
    dates: string
    inviterName: string
    /** "organizer" or "owner". */
    role: string
    isOwner: boolean
    /** The email they were added with: someone without an account signs up with it to get in. */
    email: string
    /** They already have a Travel HQ account, so the link opens the trip's Control panel rather than sign-up. */
    signedUp: boolean
    link: string
  }
}

/** An email to a guest: always has their trip and them. */
export type GuestEmailContext = EmailContext & {
  trip: NonNullable<EmailContext['trip']>
  guest: NonNullable<EmailContext['guest']>
}

export type VariableGroup =
  | 'trip'
  | 'guest'
  | 'paymentDetails'
  | 'contact'
  | 'invite'
  | 'reminder'
  | 'announcement'
  | 'question'

export interface Variable {
  path: string
  label: string
  /** A list: used as {{#each path}}…{{/each}}, with these fields inside. */
  fields?: { name: string; label: string }[]
}

/** Every variable, by group: the editor lists them, and `checkTemplate` allows only these. */
export const VARIABLES: Record<VariableGroup, Variable[]> = {
  trip: [
    { path: 'trip.name', label: 'Trip name' },
    { path: 'trip.destination', label: 'Destination' },
    { path: 'trip.dates', label: 'Dates, written out' },
    { path: 'trip.startDate', label: 'First day' },
    { path: 'trip.endDate', label: 'Last day' },
    { path: 'trip.organizerName', label: 'Organizer’s name' },
    { path: 'trip.description', label: 'Description' },
    { path: 'trip.pricePerPerson', label: 'Price per person' },
    { path: 'trip.installmentCount', label: 'Number of payments' },
    { path: 'trip.pageLink', label: 'Trip page link' },
    { path: 'trip.joinLink', label: 'Guest’s join page link' },
    {
      path: 'trip.highlights',
      label: 'Highlights',
      fields: [
        { name: 'title', label: 'Title' },
        { name: 'detail', label: 'Line' },
      ],
    },
    {
      path: 'trip.keyDates',
      label: 'Key dates',
      fields: [
        { name: 'date', label: 'Date' },
        { name: 'label', label: 'What happens' },
      ],
    },
  ],
  guest: [
    { path: 'guest.firstName', label: 'First name' },
    { path: 'guest.lastName', label: 'Last name' },
    { path: 'guest.fullName', label: 'Full name' },
    { path: 'guest.email', label: 'Email' },
    { path: 'guest.phone', label: 'Phone' },
    { path: 'guest.status', label: 'Status' },
    { path: 'guest.accepted', label: 'Accepted (yes or no)' },
    { path: 'guest.canPay', label: 'Can pay now (yes or no)' },
    { path: 'guest.waitlisted', label: 'On the waitlist (yes or no)' },
    { path: 'guest.room', label: 'Room' },
  ],
  reminder: [
    { path: 'reminder.label', label: 'What happens' },
    { path: 'reminder.date', label: 'The date' },
    { path: 'reminder.when', label: 'How soon (like “in 7 days”)' },
    { path: 'reminder.paymentDue', label: 'A payment is due (yes or no)' },
    { path: 'reminder.amountDue', label: 'Owed by the date' },
  ],
  announcement: [
    { path: 'announcement.from', label: 'Who posted it' },
    { path: 'announcement.body', label: 'What they wrote' },
  ],
  question: [
    { path: 'question.tripName', label: 'Trip name' },
    { path: 'question.askerName', label: 'Who asked' },
    { path: 'question.question', label: 'The question' },
    { path: 'question.answer', label: 'The answer (empty until answered)' },
    { path: 'question.private', label: 'Answered for them only (yes or no)' },
    {
      path: 'question.link',
      label: 'Link: Trip Control for the owner, the trip page for the asker',
    },
  ],
  contact: [
    { path: 'contact.name', label: 'Their name' },
    { path: 'contact.email', label: 'Their email' },
    { path: 'contact.topic', label: 'Topic' },
    { path: 'contact.message', label: 'Their message' },
  ],
  invite: [
    { path: 'invite.tripName', label: 'Trip name' },
    { path: 'invite.destination', label: 'Destination' },
    { path: 'invite.dates', label: 'Dates, written out' },
    { path: 'invite.inviterName', label: 'Who added them' },
    { path: 'invite.role', label: 'Their role (organizer or owner)' },
    { path: 'invite.isOwner', label: 'Added as an owner (yes or no)' },
    { path: 'invite.email', label: 'The email they were added with' },
    { path: 'invite.signedUp', label: 'Already has an account (yes or no)' },
    { path: 'invite.link', label: 'Link: the Control panel, or sign-up for someone new' },
  ],
  paymentDetails: [
    {
      path: 'paymentDetails.methods',
      label: 'Ways to pay',
      fields: [
        { name: 'name', label: 'Method' },
        { name: 'handle', label: 'Where to send it' },
      ],
    },
    { path: 'paymentDetails.oneMethod', label: 'Only one way to pay (yes or no)' },
    { path: 'paymentDetails.instructions', label: 'Payment note' },
    { path: 'paymentDetails.price', label: 'Their price' },
    {
      path: 'paymentDetails.adjustments',
      label: 'Credits and charges (like −$50, empty when none)',
    },
    { path: 'paymentDetails.total', label: 'Price with credits and charges' },
    {
      path: 'paymentDetails.firstPayment',
      label: 'First payment (the deposit, when there is one)',
    },
    { path: 'paymentDetails.deposit', label: 'Starts with a deposit (yes or no)' },
    { path: 'paymentDetails.depositKept', label: 'Deposit is non-refundable (yes or no)' },
    { path: 'paymentDetails.paid', label: 'Paid (confirmed)' },
    { path: 'paymentDetails.pending', label: 'Reported, not yet confirmed' },
    { path: 'paymentDetails.left', label: 'Left to pay' },
    { path: 'paymentDetails.dueNow', label: 'Due now' },
    { path: 'paymentDetails.installmentCount', label: 'Number of payments' },
  ],
}

const BLOCK_HELPERS = new Set(['if', 'unless', 'each'])

type Node = hbs.AST.Node

/**
 * The problems with a template, as the editor shows them (empty when it's fine): a variable that doesn't exist or
 * isn't allowed in this email, a helper we don't have, triple braces, or a syntax error.
 */
export function checkTemplate(source: string, groups: VariableGroup[]): string[] {
  let ast: hbs.AST.Program
  try {
    ast = Handlebars.parse(source)
  } catch (err) {
    return [`The template doesn't read: ${(err as Error).message.split('\n')[0]}`]
  }
  const allowed = new Map<string, Variable>()
  for (const g of groups) {
    // The group itself, for {{#if paymentDetails}}.
    allowed.set(g, { path: g, label: g })
    for (const v of VARIABLES[g]) allowed.set(v.path, v)
  }
  const problems = new Set<string>()

  // `fields` is the list item's fields inside an {{#each}}, null outside one.
  const path = (p: hbs.AST.PathExpression, fields: Set<string> | null, asList: boolean) => {
    if (p.data) {
      if (!fields || !['index', 'first', 'last'].includes(p.original.slice(1)))
        problems.add(`{{${p.original}}} only works inside {{#each}}`)
      return
    }
    const name = p.original.replace(/^(\.\.\/)+/, '').replace(/^this\./, '')
    if (fields && p.depth === 0 && !p.original.startsWith('this.') && fields.has(name)) return
    if (fields && p.original.startsWith('this.')) {
      if (!fields.has(name)) problems.add(`{{${p.original}}} isn't a field of this list`)
      return
    }
    const v = allowed.get(name)
    if (!v) problems.add(`{{${name}}} isn't a variable this email has`)
    else if (asList && !v.fields) problems.add(`{{#each ${name}}} needs a list`)
  }

  const walk = (node: Node | undefined, fields: Set<string> | null): void => {
    if (!node) return
    switch (node.type) {
      case 'Program':
        for (const s of (node as hbs.AST.Program).body) walk(s, fields)
        return
      case 'MustacheStatement': {
        const m = node as hbs.AST.MustacheStatement
        if (!m.escaped) problems.add('Use {{double braces}}; {{{triple braces}}} are not allowed')
        if (m.params.length || m.hash) problems.add('Only variables go in {{ }}')
        if (m.path.type === 'PathExpression') path(m.path as hbs.AST.PathExpression, fields, false)
        return
      }
      case 'BlockStatement': {
        const b = node as hbs.AST.BlockStatement
        const helper = (b.path as hbs.AST.PathExpression).original
        if (!BLOCK_HELPERS.has(helper) || b.params.length !== 1 || b.hash) {
          problems.add(
            `{{#${helper}}} isn't something templates can use (only #if, #unless and #each)`
          )
          return
        }
        const param = b.params[0]
        if (param.type !== 'PathExpression') {
          problems.add(`{{#${helper}}} needs a variable`)
          return
        }
        path(param as hbs.AST.PathExpression, fields, helper === 'each')
        const list = allowed.get((param as hbs.AST.PathExpression).original)
        walk(b.program, helper === 'each' ? new Set(list?.fields?.map((f) => f.name)) : fields)
        walk(b.inverse, fields)
        return
      }
      case 'ContentStatement':
      case 'CommentStatement':
        return
      default:
        problems.add('Partials and other Handlebars features are not allowed')
    }
  }
  walk(ast, null)
  return [...problems]
}

/** Fills in a checked template. `escape` is false only for the subject, which is plain text, not HTML. */
export function fill(source: string, context: EmailContext, escape = true): string {
  return Handlebars.compile(source, { knownHelpersOnly: true, noEscape: !escape, compat: true })(
    context
  )
}

/** The plain-text copy of an email's HTML: links as "text (url)", paragraphs and line breaks kept. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|head|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, text: string) => {
      const label = text.replace(/<[^>]+>/g, '').trim()
      return label && label !== href ? `${label} (${href})` : href
    })
    .replace(/\s*<li[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|tr|ul|ol|table)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&#x3D;/g, '=')
    .replace(/&#x60;/g, '`')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * The Travel HQ frame every email sits in: a royal band with the logo (white and marigold), a white card, and a footer. Tables and inline
 * styles, because that's what Gmail, Outlook and phone mail apps all draw the same way.
 */
export function layout(body: string, footer: string, logoSrc = `cid:${LOGO_CID}`): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F6F5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F6F5;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="background:#5A2D91;border-radius:12px 12px 0 0;padding:16px 24px;"><img src="${logoSrc}" width="152" height="36" alt="Travel HQ" style="display:block;border:0;"></td></tr>
<tr><td style="background:#ffffff;border-radius:0 0 12px 12px;padding:24px;font-family:'Instrument Sans',Arial,sans-serif;font-size:16px;line-height:1.5;color:#0F1C2E;">
${body}
</td></tr>
<tr><td style="padding:16px 24px;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:#5b6472;text-align:center;">${footer}</td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

/**
 * The logo every email shows, sent inside the email (cid:) rather than linked, so it shows with no website to load it
 * from and isn't blocked as a remote image. The preview uses it as a data: link instead.
 */
export const LOGO_CID = 'travelhq-logo'
export const SUBJECT_PREFIX = '[Travel HQ] '
export const LOGO_PNG = readFileSync(join(__dirname, '../../assets/email-logo.png'))
export const LOGO_DATA_URL = `data:image/png;base64,${LOGO_PNG.toString('base64')}`

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

/** Renders a template into what is sent: the subject on one line, the HTML in the frame, and its plain-text copy. */
export function render(
  template: { subject: string; body: string },
  context: EmailContext,
  logoSrc?: string
): RenderedEmail {
  // Every subject starts with "[Travel HQ] " (owner's decision, 2026-10-28), added here so no template can drop it.
  const filled = fill(template.subject, context, false).replace(/\s+/g, ' ').trim()
  const subject = filled.startsWith(SUBJECT_PREFIX) ? filled : `${SUBJECT_PREFIX}${filled}`
  const body = fill(template.body, context)
  const trip = context.trip && Handlebars.escapeExpression(context.trip.name)
  const organizer = context.trip && Handlebars.escapeExpression(context.trip.organizerName)
  const invite = context.invite && {
    trip: Handlebars.escapeExpression(context.invite.tripName),
    by: Handlebars.escapeExpression(context.invite.inviterName),
  }
  const question = context.question && {
    trip: Handlebars.escapeExpression(context.question.tripName),
    answered: context.question.answer !== '',
  }
  const footer = context.stopLink
    ? `You’re getting this ${context.announcement ? 'update' : 'reminder'} because you’re on ${trip}, which ${organizer} runs on Travel HQ. ` +
      `Don’t want ${context.announcement ? 'updates' : 'reminders'} like this one? <a href="${Handlebars.escapeExpression(context.stopLink)}" style="color:#5A2D91;">Stop updates for this trip</a>. ` +
      `Travel HQ never handles money: you pay ${organizer} directly.`
    : context.trip
      ? `You’re getting this because you signed the trip agreement for ${trip}, which ${organizer} runs on Travel HQ. ` +
        `While you’re on the trip, you’ll get emails about your spot and your payments. To stop them, reply to this email to ask ` +
        `${organizer} to take you off the trip. Travel HQ never handles money: you pay ${organizer} directly.`
      : invite
        ? `You’re getting this because ${invite.by} added you to help run ${invite.trip} on Travel HQ. ` +
          `If you weren’t expecting it, reply to this email to tell ${invite.by}.`
        : question
          ? question.answered
            ? `You’re getting this because you asked a question about ${question.trip} on Travel HQ.`
            : `You’re getting this because someone asked a question about ${question.trip}, which you run on Travel HQ. ` +
              'Reply to this email to answer them directly.'
          : 'Sent from the contact form on Travel HQ. Reply to answer them.'
  return {
    subject,
    html: layout(body, footer, logoSrc),
    text: `${htmlToText(body)}\n\n--\n${htmlToText(footer)}`,
  }
}
