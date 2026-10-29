import { Body, Controller, HttpCode, Ip, Post, ServiceUnavailableException } from '@nestjs/common'
import { RateLimiter } from '../core/rate-limit'
import { EmailsService } from '../messaging/emails.service'
import { CONTACT_TOPIC_LABELS } from '../trips/trip-types'
import { parseContactInput } from './contact-input'

/**
 * The public contact form. A message is emailed to SUPPORT_EMAIL as the "contact" email (its wording is on the Admin
 * toolbox's Emails page), with Reply-To set to the sender, so support answers by replying (logged, not sent, without
 * RESEND_API_KEY). A filled-in honeypot is accepted and dropped, so a bot learns
 * nothing. A small in-memory limit per address keeps one sender from flooding it.
 */
@Controller('contact')
export class ContactController {
  private readonly limit = new RateLimiter(5, 10 * 60 * 1000, 'Too many messages')

  constructor(private readonly emails: EmailsService) {}

  @Post()
  @HttpCode(204)
  async send(@Body() body: unknown, @Ip() ip: string) {
    const input = parseContactInput(body)
    if (input.website) return
    this.limit.hit(ip)
    try {
      await this.emails.sendContact(
        {
          name: input.name,
          email: input.email,
          topic: CONTACT_TOPIC_LABELS[input.topic],
          message: input.message,
        },
        process.env.SUPPORT_EMAIL ?? 'support@travel-hq.app'
      )
    } catch (err) {
      console.error(err instanceof Error ? err.message : 'Contact email failed')
      throw new ServiceUnavailableException('Your message didn’t send. Try again in a minute.')
    }
  }
}
