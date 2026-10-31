import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import type { Caller } from '../auth/caller'
import { runAsSystem } from '../core/tenant-context'
import { PrismaService } from '../prisma/prisma.service'
import type {
  AdminSentEmails,
  EmailSendStatus,
  EmailPreview,
  EmailPreviewGuest,
  EmailProblemNotice,
  EmailTemplateInput,
  EmailTemplateView,
} from '../trips/trip-types'
import { EMAIL_KINDS, emailKind, sampleFor, type EmailKind } from './email-defaults'
import { guestEmailContext, type GuestEmailView, type GuestFacts } from './email-context'
import {
  checkTemplate,
  LOGO_DATA_URL,
  render,
  VARIABLES,
  type EmailContext,
  type VariableGroup,
} from './email-template'
import { sendEmail, type Email, type EmailResult } from './send-email'

const GROUP_NAMES: Record<VariableGroup, string> = {
  trip: 'Trip',
  guest: 'Guest',
  paymentDetails: 'Payment details',
  contact: 'Contact form',
  invite: 'Invite',
  reminder: 'Reminder',
  announcement: 'Announcement',
  question: 'Question',
  deletion: 'Trip deleted',
  alert: 'What needs them',
}

const PREVIEW_GUESTS: EmailPreviewGuest[] = ['can_pay', 'not_yet', 'waitlisted']

/** Checks the Emails page's form: a subject on one line and a body, both within the table's limits. */
export function parseEmailTemplateInput(raw: unknown): EmailTemplateInput {
  const body = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const html = typeof body.body === 'string' ? body.body.trim() : ''
  if (!subject) throw new BadRequestException('Write a subject')
  if (subject.length > 200)
    throw new BadRequestException('The subject must be at most 200 characters')
  if (!html) throw new BadRequestException('Write the email')
  if (html.length > 50000)
    throw new BadRequestException('The email must be at most 50,000 characters')
  return { subject, body: html }
}

/**
 * The emails Travel HQ sends: the admin's versions (EmailTemplate, which only the admin can write) over the defaults
 * in email-defaults.ts, and sending one to a guest.
 */
@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name)

  constructor(private readonly prisma: PrismaService) {}

  private kindOf(kind: string): EmailKind {
    const k = emailKind(kind)
    if (!k) throw new NotFoundException('No such email')
    return k
  }

  private problems(k: EmailKind, t: EmailTemplateInput): string[] {
    return [...checkTemplate(t.subject, k.groups), ...checkTemplate(t.body, k.groups)]
  }

  /** The template an email is sent with: the admin's version, or the default. */
  private async template(k: EmailKind): Promise<EmailTemplateInput & { updatedAt: Date | null }> {
    const row = await this.prisma.emailTemplate.findUnique({ where: { kind: k.kind } })
    if (row && this.problems(k, row).length === 0) return row
    return { subject: k.subject, body: k.body, updatedAt: null }
  }

  async list(): Promise<EmailTemplateView[]> {
    return Promise.all(EMAIL_KINDS.map((k) => this.get(k.kind)))
  }

  async get(kind: string): Promise<EmailTemplateView> {
    const k = this.kindOf(kind)
    const t = await this.template(k)
    return {
      kind: k.kind,
      name: k.name,
      when: k.when,
      subject: t.subject,
      body: t.body,
      variables: k.groups.map((g) => ({ group: GROUP_NAMES[g], items: VARIABLES[g] })),
      isDefault: t.updatedAt === null,
      updatedAt: t.updatedAt?.toISOString() ?? null,
    }
  }

  /** A draft filled in for a sample guest, or its problems: the Emails page shows this as the admin types. */
  preview(kind: string, draft: EmailTemplateInput, guest: string): EmailPreview {
    const k = this.kindOf(kind)
    const subjectProblems = checkTemplate(draft.subject, k.groups)
    const bodyProblems = checkTemplate(draft.body, k.groups)
    if (subjectProblems.length || bodyProblems.length)
      return { subjectProblems, bodyProblems, subject: '', html: '', text: '' }
    const who = PREVIEW_GUESTS.includes(guest as EmailPreviewGuest)
      ? (guest as EmailPreviewGuest)
      : 'can_pay'
    return { subjectProblems, bodyProblems, ...render(draft, sampleFor(k, who), LOGO_DATA_URL) }
  }

  /** The admin saves its version; the database refuses anyone else (EmailTemplate policies). */
  async save(kind: string, input: EmailTemplateInput, caller: Caller): Promise<EmailTemplateView> {
    const k = this.kindOf(kind)
    const problems = this.problems(k, input)
    if (problems.length) throw new BadRequestException(problems.join(' '))
    const data = { ...input, updatedAt: new Date(), updatedByUserId: caller.userId }
    await this.prisma.emailTemplate.upsert({
      where: { kind },
      create: { kind, ...data },
      update: data,
    })
    return this.get(kind)
  }

  /** Back to the wording Travel HQ started with. */
  async reset(kind: string): Promise<EmailTemplateView> {
    this.kindOf(kind)
    await this.prisma.emailTemplate.deleteMany({ where: { kind } })
    return this.get(kind)
  }

  /**
   * Sends a guest who joined one of the emails, from their join page's view (or the same facts from Trip Control). A failure is logged, never thrown: the
   * step that sent it (joining, say) has already happened, and the guest's page has everything the email does.
   */
  async sendToGuest(
    kind: string,
    view: GuestEmailView,
    facts: GuestFacts,
    webUrl: string,
    /** A reminder's date, an announcement or a deleted trip's record, and the "Stop updates for this trip" link. */
    extra: Pick<EmailContext, 'reminder' | 'announcement' | 'deletion' | 'stopLink'> = {},
    attachments?: Email['attachments']
  ): Promise<void> {
    try {
      const k = this.kindOf(kind)
      const email = render(await this.template(k), {
        ...guestEmailContext(view, facts, webUrl),
        ...extra,
      })
      await this.deliver(
        k.kind,
        { to: facts.email, replyTo: facts.replyTo, ...email, attachments },
        { slug: view.trip.slug }
      )
    } catch (err) {
      this.logger.error(
        `The "${kind}" email failed: ${err instanceof Error ? err.message : 'unknown'}`
      )
    }
  }

  /**
   * The email to someone added to help run a trip, with Reply-To set to whoever added them. Logged, never thrown, as
   * for a guest: they're already on the trip (or invited), and the People screen shows it.
   */
  async sendInvite(
    invite: NonNullable<EmailContext['invite']>,
    replyTo?: string,
    tripId?: string
  ): Promise<void> {
    try {
      const email = render(await this.template(this.kindOf('invite')), { invite })
      await this.deliver('invite', { to: invite.email, replyTo, ...email }, { id: tripId })
    } catch (err) {
      this.logger.error(
        `The "invite" email failed: ${err instanceof Error ? err.message : 'unknown'}`
      )
    }
  }

  /**
   * A question about a trip: to its owner when asked (Reply-To the asker, so replying answers them), or to the asker
   * when answered. Logged, never thrown: the question or answer is saved, and Trip Control or the trip page shows it.
   */
  async sendQuestion(
    kind: 'question_asked' | 'question_answered',
    question: NonNullable<EmailContext['question']>,
    to: string,
    replyTo?: string,
    tripId?: string
  ): Promise<void> {
    try {
      const email = render(await this.template(this.kindOf(kind)), { question })
      await this.deliver(kind, { to, replyTo, ...email }, { id: tripId })
    } catch (err) {
      this.logger.error(
        `The "${kind}" email failed: ${err instanceof Error ? err.message : 'unknown'}`
      )
    }
  }

  /**
   * The contact form's message to Travel HQ support, with Reply-To set to the sender so replying answers them. A
   * failure throws: the person is still on the form and can send it again.
   */
  async sendContact(contact: NonNullable<EmailContext['contact']>, to: string): Promise<void> {
    const email = render(await this.template(this.kindOf('contact')), { contact })
    await this.deliver('contact', { to, replyTo: contact.email, ...email })
  }

  /**
   * An organizer's email about what needs them on their trips (organizer alerts). Logged, never thrown: the Actions
   * are on their Trip Control either way. True when it went (or, with no Resend key, was logged instead).
   */
  async sendAlert(alert: NonNullable<EmailContext['alert']>, to: string): Promise<boolean> {
    try {
      const email = render(await this.template(this.kindOf('organizer_actions')), { alert })
      const result = await this.deliver('organizer_actions', { to, ...email })
      return result.sent || result.reason === 'mocked'
    } catch (err) {
      this.logger.error(
        `The "organizer_actions" email failed: ${err instanceof Error ? err.message : 'unknown'}`
      )
      return false
    }
  }

  /**
   * Sends one email and writes it in the sent-email log (EmailSend): the envelope, never the body. A failure to send
   * is logged as failed and thrown on, as sendEmail throws it; a failure to write the log is only logged.
   */
  private async deliver(
    kind: string,
    email: Email,
    trip: { id?: string; slug?: string } = {}
  ): Promise<EmailResult> {
    let result: EmailResult | null = null
    let error: unknown = null
    try {
      result = await sendEmail(email)
    } catch (err) {
      error = err
    }
    await this.logSend(kind, email, trip, result, error)
    if (error) throw error
    return result!
  }

  private async logSend(
    kind: string,
    email: Email,
    trip: { id?: string; slug?: string },
    result: EmailResult | null,
    error: unknown
  ): Promise<void> {
    try {
      // Trusted work: the log is the admin's, and a guest's joining or a webhook is what sends most emails.
      await runAsSystem(async () => {
        const tripId =
          trip.id ??
          (trip.slug
            ? (
                await this.prisma.trip.findUnique({
                  where: { slug: trip.slug },
                  select: { id: true },
                })
              )?.id
            : undefined)
        await this.prisma.emailSend.create({
          data: {
            kind,
            toAddress: email.to.trim().toLowerCase().slice(0, 254),
            subject: email.subject.slice(0, 300),
            tripId: tripId ?? null,
            resendId: result?.sent ? result.id : null,
            status: error ? 'failed' : result?.sent ? 'sent' : (result?.reason ?? 'failed'),
            detail: error instanceof Error ? error.message.slice(0, 500) : '',
          },
          select: { id: true },
        })
      })
    } catch (err) {
      this.logger.error(
        `Could not log the "${kind}" email: ${err instanceof Error ? err.message : 'unknown'}`
      )
    }
  }

  /** The Admin toolbox's Sent Emails: the last 30 days, newest first, with each one's trip. */
  async listSent(): Promise<AdminSentEmails> {
    const rows = await this.prisma.emailSend.findMany({
      orderBy: { sentAt: 'desc' },
      take: 2000,
      include: { trip: { select: { name: true } } },
    })
    const names = new Map(EMAIL_KINDS.map((k) => [k.kind, k.name]))
    return {
      emails: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        kindName: names.get(r.kind) ?? r.kind,
        to: r.toAddress,
        subject: r.subject,
        tripId: r.tripId,
        tripName: r.trip?.name ?? null,
        status: r.status as EmailSendStatus,
        detail: r.detail,
        sentAt: r.sentAt.toISOString(),
        statusAt: r.statusAt.toISOString(),
        resendId: r.resendId,
      })),
      kinds: EMAIL_KINDS.map((k) => ({ kind: k.kind, name: k.name })),
    }
  }

  /**
   * Tells the Travel HQ team at once about a new early access request or referral (issue #39, kept cheap: sent as a
   * contact form email to SUPPORT_EMAIL). Replying goes to whoever asked, or to the referrer. Never rejects: a failed
   * alert is logged, and the request is still on the Requests page.
   */
  alertEarlyAccess(ask: {
    name: string
    email: string
    note: string
    referredBy?: { name: string; email: string }
  }): void {
    const web = (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',')[0].trim()
    const who = ask.referredBy ?? { name: ask.name, email: ask.email }
    const lines = [
      ask.referredBy
        ? `${ask.referredBy.name} referred ${ask.name} (${ask.email}) to start trips.`
        : `${ask.name} (${ask.email}) asked for early access to start trips.`,
      ask.note && `Their note: ${ask.note}`,
      `Approve it in the Admin toolbox: ${web}/admin/requests`,
    ]
    this.sendContact(
      {
        name: who.name,
        email: who.email,
        topic: ask.referredBy ? 'Referral' : 'Early access request',
        message: lines.filter(Boolean).join('\n\n'),
      },
      process.env.SUPPORT_EMAIL ?? 'support@travel-hq.app'
    ).catch((err) =>
      console.error(`Early access alert failed: ${err instanceof Error ? err.message : err}`)
    )
  }

  /** The Admin toolbox's Email problems, newest first; the database lets only the admin read them. */
  async listProblems(): Promise<EmailProblemNotice[]> {
    const rows = await this.prisma.$queryRaw<(Omit<EmailProblemNotice, 'at'> & { at: Date })[]>`
      SELECT * FROM "admin_email_problems"()`
    return rows.map((r) => ({ ...r, at: r.at.toISOString() }))
  }
}
