import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
  type RawBodyRequest,
} from '@nestjs/common'
import type { Request } from 'express'
import { Resend } from 'resend'
import { runAsSystem } from '../core/tenant-context'
import { PrismaService } from '../prisma/prisma.service'
import { maskEmail } from './send-email'

/** The Resend events we keep: the address bounces, a send was blocked because it bounced before, or spam. */
const PROBLEMS: Record<string, 'bounced' | 'blocked' | 'complained'> = {
  'email.bounced': 'bounced',
  'email.suppressed': 'blocked',
  'email.complained': 'complained',
}

type Notice = {
  type: string
  data?: {
    to?: string[]
    subject?: string
    bounce?: { message?: string }
    suppressed?: { message?: string }
  }
}

/**
 * Resend tells us when an email bounced, was blocked because the address bounced before, or was marked as spam.
 * Every guest row with that address gets the problem, so Trip Control's Actions asks the organizer to fix it. Signed
 * by Resend (Svix) with RESEND_WEBHOOK_SECRET; anything unsigned or for other events is ignored.
 */
@Controller('webhooks/resend')
export class ResendWebhookController {
  private readonly logger = new Logger(ResendWebhookController.name)

  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @HttpCode(204)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') id: string,
    @Headers('svix-timestamp') timestamp: string,
    @Headers('svix-signature') signature: string
  ) {
    const secret = process.env.RESEND_WEBHOOK_SECRET
    if (!secret) throw new ServiceUnavailableException('Resend webhook not set up')
    let event: Notice
    try {
      // verify() only checks the signature; the client's key isn't used for it.
      event = new Resend(process.env.RESEND_API_KEY || 're_unused').webhooks.verify({
        payload: req.rawBody?.toString('utf8') ?? '',
        headers: { id, timestamp, signature },
        webhookSecret: secret,
      }) as typeof event
    } catch {
      throw new BadRequestException('Bad signature')
    }
    const problem = PROBLEMS[event.type]
    if (!problem) return
    const why = event.data?.bounce?.message ?? event.data?.suppressed?.message ?? ''
    for (const to of event.data?.to ?? []) {
      const [{ n }] = await runAsSystem(
        () =>
          this.prisma.$queryRaw<
            { n: number }[]
          >`SELECT "note_email_problem"(${to}, ${problem}, ${event.data?.subject ?? ''}, ${why}) AS n`
      )
      this.logger.log(`${event.type} for ${maskEmail(to)}: ${n} guest row(s) marked`)
    }
  }
}
