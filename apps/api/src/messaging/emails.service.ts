import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import type { Caller } from '../auth/caller'
import { PrismaService } from '../prisma/prisma.service'
import type {
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
import { sendEmail, type Email } from './send-email'

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
      await sendEmail({ to: facts.email, replyTo: facts.replyTo, ...email, attachments })
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
  async sendInvite(invite: NonNullable<EmailContext['invite']>, replyTo?: string): Promise<void> {
    try {
      const email = render(await this.template(this.kindOf('invite')), { invite })
      await sendEmail({ to: invite.email, replyTo, ...email })
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
    replyTo?: string
  ): Promise<void> {
    try {
      const email = render(await this.template(this.kindOf(kind)), { question })
      await sendEmail({ to, replyTo, ...email })
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
    await sendEmail({ to, replyTo: contact.email, ...email })
  }

  /** The Admin toolbox's Email problems, newest first; the database lets only the admin read them. */
  async listProblems(): Promise<EmailProblemNotice[]> {
    const rows = await this.prisma.$queryRaw<(Omit<EmailProblemNotice, 'at'> & { at: Date })[]>`
      SELECT * FROM "admin_email_problems"()`
    return rows.map((r) => ({ ...r, at: r.at.toISOString() }))
  }
}
