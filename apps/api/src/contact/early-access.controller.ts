import { Body, Controller, HttpCode, Ip, Post } from '@nestjs/common'
import { RateLimiter } from '../core/rate-limit'
import { runAsPublic } from '../core/tenant-context'
import { EmailsService } from '../messaging/emails.service'
import { PrismaService } from '../prisma/prisma.service'
import { parseEarlyAccess } from './early-access-input'

/**
 * The early access form on the limited preview page (owner's decision, 2026-10-30: only admins start trips for now).
 * Public, as the contact form is: no sign-in, a honeypot that is accepted and dropped, and a small limit per address.
 * Asking again with the same email keeps the first request. The Admin toolbox lists them under Requests, and a new
 * one emails the team at once.
 */
@Controller('early-access')
export class EarlyAccessController {
  private readonly limit = new RateLimiter(5, 10 * 60 * 1000, 'Too many requests')

  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailsService
  ) {}

  @Post()
  @HttpCode(204)
  async add(@Body() body: unknown, @Ip() ip: string) {
    const { website, ...input } = parseEarlyAccess(body)
    if (website) return
    this.limit.hit(ip)
    // Written without reading it back: only the admin reads these.
    const { count } = await runAsPublic(() =>
      this.prisma.earlyAccessRequest.createMany({ data: input, skipDuplicates: true })
    )
    if (count) this.emails.alertEarlyAccess(input)
  }
}
