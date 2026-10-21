import { Body, Controller, HttpCode, HttpException, HttpStatus, Ip, Post } from '@nestjs/common'
import { CONTACT_TOPIC_LABELS } from '../trips/trip-types'
import { parseContactInput } from './contact-input'

const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_WINDOW = 5

/**
 * The public contact form. Email is mocked until the comms slice (CLAUDE.md "Prototype limits"), so a message is
 * logged with where it would go: SUPPORT_EMAIL. A filled-in honeypot is accepted and dropped, so a bot learns
 * nothing. A small in-memory limit per address keeps one sender from flooding it.
 */
@Controller('contact')
export class ContactController {
  private readonly recent = new Map<string, number[]>()

  @Post()
  @HttpCode(204)
  send(@Body() body: unknown, @Ip() ip: string) {
    const input = parseContactInput(body)
    if (input.website) return
    this.limit(ip)
    const to = process.env.SUPPORT_EMAIL ?? 'support@crewcontrol.vacations'
    console.log(
      `[mock email] to ${to}, reply to ${input.name} <${input.email}>: ${CONTACT_TOPIC_LABELS[input.topic]}\n${input.message}`
    )
  }

  private limit(ip: string) {
    const now = Date.now()
    const times = (this.recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
    if (times.length >= MAX_PER_WINDOW)
      throw new HttpException('Too many messages', HttpStatus.TOO_MANY_REQUESTS)
    this.recent.set(ip, [...times, now])
  }
}
