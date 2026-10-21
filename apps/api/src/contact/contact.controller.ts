import { Body, Controller, HttpCode, Ip, Post } from '@nestjs/common'
import { RateLimiter } from '../core/rate-limit'
import { CONTACT_TOPIC_LABELS } from '../trips/trip-types'
import { parseContactInput } from './contact-input'

/**
 * The public contact form. Email is mocked until the comms slice (CLAUDE.md "Prototype limits"), so a message is
 * logged with where it would go: SUPPORT_EMAIL. A filled-in honeypot is accepted and dropped, so a bot learns
 * nothing. A small in-memory limit per address keeps one sender from flooding it.
 */
@Controller('contact')
export class ContactController {
  private readonly limit = new RateLimiter(5, 10 * 60 * 1000, 'Too many messages')

  @Post()
  @HttpCode(204)
  send(@Body() body: unknown, @Ip() ip: string) {
    const input = parseContactInput(body)
    if (input.website) return
    this.limit.hit(ip)
    const to = process.env.SUPPORT_EMAIL ?? 'support@crewcontrol.vacations'
    console.log(
      `[mock email] to ${to}, reply to ${input.name} <${input.email}>: ${CONTACT_TOPIC_LABELS[input.topic]}\n${input.message}`
    )
  }
}
