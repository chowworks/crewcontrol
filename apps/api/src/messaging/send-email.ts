import { Logger } from '@nestjs/common'
import { Resend } from 'resend'
import { LOGO_CID, LOGO_PNG } from './email-template'

const logger = new Logger('SendEmail')

export interface Email {
  to: string
  subject: string
  /** Plain text: every email has it, for mail apps that don't show HTML. */
  text: string
  /** The designed version, when there is one (email-template.ts). */
  html?: string
  replyTo?: string
}

/** What happened to an email: sent (with the provider's id), logged (no key, so mocked), or skipped (and why). */
export type EmailResult =
  { sent: true; id: string } | { sent: false; reason: 'mocked' | 'not_deliverable' }

// Domains that can never take mail (RFC 2606 and RFC 6761): the seed's fictional guests use them, so dev never
// bounces mail off them and hurts the sending domain's name.
const RESERVED = /(^|\.)(example\.(com|net|org)|test|example|invalid|localhost)$/i

/** Whether mail could reach this address: its domain is a real one, not a reserved or local name. */
export function deliverable(to: string): boolean {
  const domain = to.trim().split('@')[1] ?? ''
  return domain.includes('.') && !RESERVED.test(domain)
}

/** An email masked for logs ("k•••@example.com"), so logs don't collect guests' addresses. */
export function maskEmail(to: string): string {
  const [local, domain] = to.split('@')
  return `${local.slice(0, 1)}•••@${domain ?? ''}`
}

let client: Resend | null | undefined
function resend(): Resend | null {
  if (client === undefined) {
    const key = process.env.RESEND_API_KEY
    client = key ? new Resend(key) : null
    if (!client) logger.warn('RESEND_API_KEY not set: emails are logged, not sent')
  }
  return client
}

/**
 * Sends one email. The one place Travel HQ sends email: through Resend when RESEND_API_KEY is set, and logged (sent
 * nowhere) when it isn't, as on a laptop. A provider error throws, so the caller decides whether it matters.
 */
export async function sendEmail(email: Email): Promise<EmailResult> {
  const to = maskEmail(email.to)
  if (!deliverable(email.to)) {
    logger.log(`Not emailed ${to}: not an address mail can reach`)
    return { sent: false, reason: 'not_deliverable' }
  }
  const api = resend()
  if (!api) {
    logger.log(`[mock email to ${to}] ${email.subject}\n${email.text}`)
    return { sent: false, reason: 'mocked' }
  }
  const { data, error } = await api.emails.send({
    from: process.env.EMAIL_FROM || 'Travel HQ <trips@travel-hq.app>',
    to: email.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
    replyTo: email.replyTo,
    // The logo travels inside the email (email-template.ts).
    attachments: email.html?.includes(`cid:${LOGO_CID}`)
      ? [{ filename: 'travel-hq.png', content: LOGO_PNG, contentId: LOGO_CID }]
      : undefined,
  })
  if (error || !data) throw new Error(`Email to ${to} failed: ${error?.message ?? 'no response'}`)
  logger.log(`Emailed ${to}: ${email.subject} (${data.id})`)
  return { sent: true, id: data.id }
}

/** For tests: forget the client, so a change to RESEND_API_KEY takes effect. */
export function resetEmailClient(): void {
  client = undefined
}
